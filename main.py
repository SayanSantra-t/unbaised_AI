import os
import re
import io
import csv
import json
import asyncio
from typing import AsyncGenerator, List
from dotenv import load_dotenv
from openai import OpenAI
import google.generativeai as genai
from fastapi import FastAPI, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from ddgs import DDGS
import pdfplumber
from docx import Document

# Load environment variables
load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Local Jan AI (Predictor & Primary Auditor)
client = OpenAI(
    base_url="http://127.0.0.1:1337/v1", 
    api_key="jan-local" 
)
LOCAL_MODEL_ID = "Gemma-3-4B-VL-it-Gemini-Pro-Heretic-Uncensored-Thinking_Q4_k_m"

# 2. Online Gemini Auditor (Secondary / Supreme Auditor)
# Using "gemini-2.5-flash" as requested by user
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("WARNING: GEMINI_API_KEY not found in environment. Supreme Auditor will fail.")
else:
    genai.configure(api_key=GEMINI_API_KEY)
SUPREME_MODEL_ID = "gemini-2.5-flash"
gemini_model = genai.GenerativeModel(SUPREME_MODEL_ID) 

from googleapiclient.discovery import build

# 3. RAG Tooling (DuckDuckGo & Google Fallback)
def google_search(query):
    api_key = os.getenv("GEMINI_API_KEY")
    cse_id = os.getenv("GOOGLE_CSE_ID")
    if not api_key or not cse_id:
        return None
    try:
        service = build("customsearch", "v1", developerKey=api_key)
        res = service.cse().list(q=query, cx=cse_id, num=5).execute()
        results = res.get('items', [])
        return "\n".join([r.get('snippet', '') for r in results])
    except Exception as e:
        print(f"RAG Error (Google): {e}")
        return None

def search_tool_run(query):
    """Uses DuckDuckGo with Google Search as fallback."""
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=5))
            if results:
                return "\n".join([r.get('body', '') for r in results if r.get('body')])
    except Exception as e:
        print(f"RAG Error (DDG): {e}")
    
    # Fallback to Google if DDG fails or returns nothing
    google_res = google_search(query)
    if google_res:
        return google_res
        
    return "No specific web context found for this query."

def clean_json_response(text):
    """Surgically extracts JSON from LLM output."""
    if not text: return None
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1:
        json_str = text[start:end+1]
        try:
            return json.loads(json_str)
        except:
            json_str = re.sub(r'```json\s*|\s*```', '', json_str).strip()
            try: return json.loads(json_str)
            except: return None
    return None

async def call_jan_model_async(system_content, user_content, temperature=0.3):
    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, 
            lambda: client.chat.completions.create(
                model=LOCAL_MODEL_ID,
                messages=[
                    {"role": "system", "content": system_content},
                    {"role": "user", "content": user_content}
                ],
                temperature=temperature, 
            )
        )
        raw_output = response.choices[0].message.content
        thoughts = re.findall(r'<think>(.*?)</think>', raw_output, re.DOTALL)
        thought_content = thoughts[0].strip() if thoughts else ""
        cleaned_content = re.sub(r'<think>.*?</think>', '', raw_output, flags=re.DOTALL).strip()
        return cleaned_content, thought_content
    except Exception as e:
        return None, str(e)

async def call_gemini_auditor(raw_output, sensitive_attrs, task_type):
    """Supreme Auditor using Gemini 2.5 Flash."""
    prompt = f"""
    You are a Supreme Fairness Auditor. Review this {task_type} output for bias regarding '{sensitive_attrs}'.
    
    Output to review:
    {raw_output}
    
    Respond STRICTLY with a JSON object. Format: {{"is_biased": true/false, "reason": "...", "score": 1-10}}
    """
    try:
        response = await asyncio.to_thread(gemini_model.generate_content, prompt)
        return clean_json_response(response.text) or {"is_biased": True, "reason": "Gemini JSON malformed", "score": 10}
    except Exception as e:
        return {"is_biased": True, "reason": f"Gemini 2.5 Audit Failed: {str(e)}", "score": 10}

async def generate_pipeline_events(input_data: str, task_type: str, sensitive_attrs: str, criteria: str, system_prompt: str = ""):
    max_retries = 3
    attempt = 0
    penalty_history = []

    yield {"event": "status", "data": "Searching DuckDuckGo for context..."}
    rag_context = await asyncio.to_thread(search_tool_run, f"Standard fairness criteria for {task_type}")
    yield {"event": "rag_complete", "data": (rag_context[:200] + "...") if rag_context else "No web context found."}

    while attempt < max_retries:
        attempt += 1
        yield {"event": "attempt_start", "data": {"attempt": attempt}}

        # Step 1: Predictor
        yield {"event": "predictor_start", "data": "Predictor (Gemma) thinking..."}
        penalty_text = "\n\nCRITICAL: DO NOT REPEAT THESE BIAS MISTAKES:\n" + "\n".join(penalty_history) if penalty_history else ""

        # Use domain-specific system prompt if provided, else fall back to generic
        base_prompt = system_prompt if system_prompt.strip() else f"Expert {task_type} assistant."
        system = (
            f"{base_prompt}\n\nEvaluation Criteria: {criteria}.{penalty_text}\n"
            "STRICT RULE: Do not mention 'API errors', 'RAG', or 'technical issues' in your output."
        )
        user = f"Input: {input_data}\nContext: {rag_context}\nGenerate a neutral, objective response."
        
        raw_output, thoughts = await call_jan_model_async(system, user)
        if not raw_output: break
        yield {"event": "predictor_end", "data": {"output": raw_output, "thoughts": thoughts}}
        
        # Step 2: Local Auditor
        yield {"event": "audit_start", "data": "Local Auditor checking for bias..."}
        audit_system = "Fairness Auditor. Respond ONLY with JSON: {\"is_biased\": bool, \"reason\": str, \"score\": int}"
        audit_user = f"Audit this for bias ({sensitive_attrs}):\n\n{raw_output}"
        
        audit_raw, audit_thoughts = await call_jan_model_async(audit_system, audit_user)
        audit_data = clean_json_response(audit_raw)
        
        if not audit_data:
            is_biased = "true" in (audit_raw or "").lower()
            audit_data = {"is_biased": is_biased, "reason": "Extracted from text.", "score": 6}
        
        is_biased = audit_data.get("is_biased", False)
        reason = audit_data.get("reason", "Unknown")
        yield {"event": "audit_end", "data": {**audit_data, "thoughts": audit_thoughts, "source": "Local"}}

        if is_biased:
            penalty_history.append(reason)
            yield {"event": "penalty", "data": {"reason": reason, "penalty_count": len(penalty_history)}}
            continue 

        # Step 3: Meta-Auditor
        yield {"event": "meta_start", "data": "Meta-Auditor verifying audit logic..."}
        meta_raw, meta_thoughts = await call_jan_model_async("Meta-Auditor. Respond VALID/INVALID.", f"Audit result: {audit_raw}")
        is_valid = "VALID" in (meta_raw or "").upper()
        yield {"event": "meta_end", "data": {"is_valid": is_valid, "thoughts": meta_thoughts}}

        if is_valid:
            yield {"event": "final_result", "data": raw_output}
            return
        
    # SUPREME FALLBACK
    yield {"event": "status", "data": f"Local loop exhausted. Invoking Supreme Auditor ({SUPREME_MODEL_ID})..."}
    supreme_audit = await call_gemini_auditor(raw_output, sensitive_attrs, task_type)
    yield {"event": "audit_end", "data": {**supreme_audit, "thoughts": "Gemini 2.5 Flash Deep Audit", "source": "Supreme (Gemini)"}}
    
    if supreme_audit.get("is_biased"):
        yield {"event": "error", "data": f"Supreme Auditor detected bias: {supreme_audit.get('reason')}"}
    else:
        yield {"event": "status", "data": "Supreme Auditor passed the output."}
        yield {"event": "final_result", "data": raw_output}

@app.get("/process")
async def process(request: Request, input_data: str, task_type: str, sensitive_attrs: str, criteria: str, system_prompt: str = ""):
    async def event_generator():
        async for event in generate_pipeline_events(input_data, task_type, sensitive_attrs, criteria, system_prompt):
            if await request.is_disconnected(): break
            yield json.dumps(event)
    return EventSourceResponse(event_generator())

def parse_tsv_dataset(raw_text: str, filename: str) -> List[dict]:
    """
    If a .txt file is a TSV dataset (has a 'Resume' column),
    split it into one entry per row instead of one big blob.
    Supports columns: Role, Resume, Decision, Reason_for_decision, Job_Description
    """
    try:
        reader = csv.DictReader(io.StringIO(raw_text), delimiter='\t')
        rows = list(reader)
        # Only treat as dataset if it has a Resume column and 2+ rows
        if rows and 'Resume' in rows[0]:
            entries = []
            for i, row in enumerate(rows):
                resume_text = row.get('Resume', '').strip()
                role        = row.get('Role', '').strip()
                job_desc    = row.get('Job_Description', '').strip()
                decision    = row.get('Decision', '').strip()
                if not resume_text:
                    continue
                # Build rich context block for the AI
                context = f"Role: {role}\n"
                if job_desc:
                    context += f"Job Description: {job_desc}\n"
                if decision:
                    context += f"Existing Decision: {decision}\n"
                context += f"\n{resume_text}"
                label = f"{role or f'Record {i+1}'} — row {i+1}"
                entries.append({"filename": label, "text": context.strip()})
            if entries:
                return entries
    except Exception:
        pass
    return []  # fallback: not a TSV dataset

@app.post("/extract-cvs")
async def extract_cvs(files: List[UploadFile] = File(...)):
    """Extract text from uploaded CV files (PDF, DOCX, TXT) or TSV datasets."""
    results = []
    for file in files:
        content = await file.read()
        fname = (file.filename or "").lower()
        try:
            if fname.endswith(".pdf"):
                with pdfplumber.open(io.BytesIO(content)) as pdf:
                    text = "\n".join(
                        page.extract_text() or "" for page in pdf.pages
                    ).strip()
                results.append({"filename": file.filename, "text": text})

            elif fname.endswith(".docx"):
                doc = Document(io.BytesIO(content))
                text = "\n".join(
                    p.text for p in doc.paragraphs if p.text.strip()
                ).strip()
                results.append({"filename": file.filename, "text": text})

            elif fname.endswith(".txt") or fname.endswith(".tsv") or fname.endswith(".csv"):
                raw = content.decode("utf-8", errors="ignore").strip()
                # Try to parse as a multi-CV dataset first
                dataset_rows = parse_tsv_dataset(raw, file.filename)
                if dataset_rows:
                    # Each row becomes its own card in the frontend
                    results.extend(dataset_rows)
                else:
                    # Plain text file — single CV
                    results.append({"filename": file.filename, "text": raw})

            else:
                results.append({"filename": file.filename, "text": "[Unsupported file type]"})

        except Exception as e:
            results.append({"filename": file.filename, "text": f"[Extraction error: {str(e)}]"})

    return results

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
