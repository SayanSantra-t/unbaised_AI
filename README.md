# Bias Model: Adversarial RAG Pipeline

This project implements a local LLM pipeline that uses an adversarial loop to identify and mitigate bias in AI-generated outputs.

## Tech Stack
- **Ollama**: Local LLM server (running `llama3` and `phi3`).
- **LangChain**: Orchestration framework.
- **RAG**: Google Search integration for up-to-date context.

## Prerequisites

1.  **Install Ollama**: [Download here](https://ollama.com/).
2.  **Download Models**:
    ```powershell
    ollama pull llama3
    ollama pull phi3
    ```
3.  **Google Search API**:
    - Get a [Google Custom Search Engine ID (CSE ID)](https://cse.google.com/cse/all).
    - Get a [Google Cloud API Key](https://console.cloud.google.com/apis/credentials).

## Setup

1.  **Create a virtual environment**:
    ```powershell
    python -m venv venv
    .\venv\Scripts\activate
    ```
2.  **Install dependencies**:
    ```powershell
    pip install -r requirements.txt
    ```
3.  **Configure environment variables**:
    - Copy `.env.example` to `.env`.
    - Fill in your `GOOGLE_API_KEY` and `GOOGLE_CSE_ID`.

## Usage

Run the main pipeline:
```powershell
python main.py
```

## How it Works
1.  **RAG Context**: Gathers real-world data via Google Search.
2.  **Base Prediction**: `llama3` generates the initial response.
3.  **Domain Discriminator**: `phi3` audits the response for bias based on specific attributes (e.g., Gender, Age).
4.  **Meta Discriminator**: `phi3` validates the auditor's findings.
5.  **Adversarial Loop**: If bias is confirmed, the system regenerates the output until it passes all checks.
