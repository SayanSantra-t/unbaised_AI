import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, BrainCircuit, Terminal, CloudLightning, Monitor,
  FileText, Upload, X, CheckCircle, XCircle, Clock,
  ChevronDown, ChevronUp, Layers, Briefcase, DollarSign,
  HeartPulse, ChevronRight, AlertTriangle
} from 'lucide-react';
import './App.css';

// ── DOMAIN PRESETS ───────────────────────────────────────────────────────────
const DOMAINS = [
  {
    key: 'job',
    label: 'Job Selection',
    sub: 'CV Analysis',
    Icon: Briefcase,
    color: '#6366f1',
    task_type: 'Job Selection (CV Analysis)',
    sensitive_attrs: 'Gender, Race, Age, Employment Gap, Educational Institution',
    criteria: 'Minimum 4 years relevant experience, demonstrated leadership skills, ability to explain employment gaps exceeding 3 months.',
    system_prompt:
      'You are an expert, unbiased HR recruitment specialist performing CV shortlisting. Evaluate candidates ONLY on measurable skills, relevant experience, technical qualifications, and role-specific achievements. NEVER factor in gender, race, age, nationality, school prestige, or personal circumstances unrelated to job performance. Flag anything that could introduce bias.',
    placeholder: 'Paste CV text, applicant summary, or job application details here...',
    batchLabel: 'Batch CVs',
    batchFileHint: 'Drop CV files — .pdf · .docx · .txt',
    batchRunLabel: 'CVs'
  },
  {
    key: 'loan',
    label: 'Loan Provision',
    sub: 'Financial Profile',
    Icon: DollarSign,
    color: '#10b981',
    task_type: 'Loan Provision (Financial Profile)',
    sensitive_attrs: 'Race, Gender, Marital Status, Nationality, Zip Code, Religion',
    criteria: 'Minimum credit score 650, stable verifiable income for 2+ years, debt-to-income ratio below 43%, adequate collateral or guarantor.',
    system_prompt:
      'You are an expert, unbiased financial analyst evaluating loan applications. Assess ONLY on objective financial metrics: credit score, income stability, debt-to-income ratio, repayment history, employment duration, and collateral value. NEVER allow race, gender, marital status, nationality, residential ZIP code, or religion to influence the credit decision. Base every recommendation on quantifiable financial data only.',
    placeholder: 'Paste financial profile, credit history, income details, or loan application here...',
    batchLabel: 'Batch Applications',
    batchFileHint: 'Drop application files — .pdf · .docx · .txt',
    batchRunLabel: 'Applications'
  },
  {
    key: 'medical',
    label: 'Medical Care',
    sub: 'Patient Data',
    Icon: HeartPulse,
    color: '#ef4444',
    task_type: 'Medical Care (Patient Data)',
    sensitive_attrs: 'Race, Gender, Age, Socioeconomic Status, Insurance Type, Language, Disability',
    criteria: 'Base treatment on clinical symptoms, evidence-based guidelines, lab results, and patient history only. Equal standard of care for all patients.',
    system_prompt:
      'You are an expert, unbiased medical professional evaluating patient cases for diagnosis and treatment recommendations. Base ALL assessments purely on clinical symptoms, objective test results, medical history, and evidence-based clinical guidelines. NEVER allow race, gender, age, insurance coverage, socioeconomic background, disability status, or language barriers to influence the standard of care or treatment. Every patient deserves equal, evidence-based medical attention.',
    placeholder: 'Paste patient medical history, presenting symptoms, lab results, and clinical data here...',
    batchLabel: 'Batch Records',
    batchFileHint: 'Drop patient record files — .pdf · .docx · .txt',
    batchRunLabel: 'Records'
  }
];

// ── MAIN APP ─────────────────────────────────────────────────────────────────
function App() {
  const [mode, setMode] = useState('manual'); // 'manual' | 'batch'
  const [activeDomain, setActiveDomain] = useState(DOMAINS[0]);

  const [formData, setFormData] = useState({
    input_data: DOMAINS[0].placeholder,
    sensitive_attrs: DOMAINS[0].sensitive_attrs,
    criteria: DOMAINS[0].criteria,
    system_prompt: DOMAINS[0].system_prompt
  });
  const [showPrompt, setShowPrompt] = useState(false);

  // Manual mode state
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState('idle');
  const [currentStep, setCurrentStep] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [penalties, setPenalties] = useState(0);
  const [finalResult, setFinalResult] = useState('');
  const [loopActive, setLoopActive] = useState(false);
  const [auditorSource, setAuditorSource] = useState('Local');
  const logEndRef = useRef(null);

  // Batch mode state
  const [cvList, setCvList] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [expandedCv, setExpandedCv] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // ── Domain switch ──
  const handleDomainChange = (domain) => {
    setActiveDomain(domain);
    setFormData(prev => ({
      ...prev,
      sensitive_attrs: domain.sensitive_attrs,
      criteria: domain.criteria,
      system_prompt: domain.system_prompt,
      // reset input only if still on the default placeholder
      input_data: DOMAINS.some(d => d.placeholder === prev.input_data)
        ? domain.placeholder
        : prev.input_data
    }));
    setFinalResult('');
    setLogs([]);
    setStatus('idle');
  };

  const addLog = (msg, type = 'info', extra = null) => {
    setLogs(prev => [...prev, { msg, type, extra, id: Date.now() + Math.random() }]);
  };

  // ── Manual run ──
  const handleRun = () => {
    setLogs([]);
    setStatus('processing');
    setFinalResult('');
    setAttempt(0);
    setPenalties(0);
    setLoopActive(false);
    setAuditorSource('Local');

    const params = new URLSearchParams({
      input_data: formData.input_data,
      task_type: activeDomain.task_type,
      sensitive_attrs: formData.sensitive_attrs,
      criteria: formData.criteria,
      system_prompt: formData.system_prompt
    });
    const eventSource = new EventSource(`http://localhost:8000/process?${params}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.event) {
        case 'status': addLog(data.data); break;
        case 'rag_complete':
          setCurrentStep('rag');
          addLog(`RAG Context: ${data.data}`, 'success');
          break;
        case 'attempt_start':
          setAttempt(data.data.attempt);
          addLog(`Starting Attempt #${data.data.attempt}...`);
          setLoopActive(false);
          break;
        case 'predictor_start': setCurrentStep('predictor'); break;
        case 'predictor_end':
          addLog('Draft generated by Predictor.', 'success', { thoughts: data.data.thoughts });
          break;
        case 'audit_start': setCurrentStep('auditor'); break;
        case 'audit_end': {
          const { is_biased, reason, score, thoughts, source } = data.data;
          setAuditorSource(source || 'Local');
          addLog(
            is_biased ? `[${source}] BIAS DETECTED! Score: ${score}/10. Reason: ${reason}` : `[${source}] Audit passed. Score: ${score}/10.`,
            is_biased ? 'error' : 'success',
            { thoughts }
          );
          break;
        }
        case 'meta_start': setCurrentStep('meta'); break;
        case 'meta_end':
          addLog(
            data.data.is_valid ? 'Audit Validated.' : 'Audit Rejected.',
            data.data.is_valid ? 'success' : 'error',
            { thoughts: data.data.thoughts }
          );
          break;
        case 'penalty':
          setPenalties(prev => prev + 1);
          setLoopActive(true);
          addLog(`Penalty Applied: ${data.data.reason}`, 'penalty');
          break;
        case 'final_result':
          setFinalResult(data.data);
          setStatus('complete');
          setCurrentStep(null);
          eventSource.close();
          break;
        case 'error':
          addLog(`Error: ${data.data}`, 'error');
          setStatus('error');
          eventSource.close();
          break;
        default: break;
      }
    };
  };

  // ── Batch file upload ──
  const handleFiles = async (files) => {
    setUploadError('');
    const valid = Array.from(files).filter(f =>
      /\.(pdf|docx|txt)$/i.test(f.name)
    );
    if (!valid.length) {
      setUploadError('Only .pdf, .docx, and .txt files are supported.');
      return;
    }
    const fd = new FormData();
    valid.forEach(f => fd.append('files', f));
    try {
      const res = await fetch('http://localhost:8000/extract-cvs', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const extracted = await res.json();
      setCvList(prev => [
        ...prev,
        ...extracted.map(cv => ({
          id: Date.now() + Math.random(),
          filename: cv.filename,
          text: cv.text,
          charCount: cv.text.length,
          status: 'pending',
          result: null
        }))
      ]);
    } catch (e) {
      setUploadError(`Upload failed: ${e.message}`);
    }
  };

  const removeCv = (id) => setCvList(prev => prev.filter(c => c.id !== id));
  const clearAll = () => { setCvList([]); setExpandedCv(null); };

  // ── Batch run ──
  const runBatch = async () => {
    setBatchRunning(true);
    const snapshot = [...cvList];
    for (const cv of snapshot) {
      if (cv.status === 'complete') continue;
      await new Promise((resolve) => {
        setCvList(prev => prev.map(c => c.id === cv.id ? { ...c, status: 'processing' } : c));
        const params = new URLSearchParams({
          input_data: cv.text,
          task_type: activeDomain.task_type,
          sensitive_attrs: formData.sensitive_attrs,
          criteria: formData.criteria,
          system_prompt: formData.system_prompt
        });
        const es = new EventSource(`http://localhost:8000/process?${params}`);
        es.onmessage = (e) => {
          const p = JSON.parse(e.data);
          if (p.event === 'final_result') {
            setCvList(prev => prev.map(c => c.id === cv.id ? { ...c, status: 'complete', result: p.data } : c));
            es.close(); resolve();
          } else if (p.event === 'error') {
            setCvList(prev => prev.map(c => c.id === cv.id ? { ...c, status: 'error', result: p.data } : c));
            es.close(); resolve();
          }
        };
        es.onerror = () => {
          setCvList(prev => prev.map(c => c.id === cv.id ? { ...c, status: 'error', result: 'Connection failed' } : c));
          es.close(); resolve();
        };
      });
    }
    setBatchRunning(false);
  };

  const completedCount = cvList.filter(c => c.status === 'complete').length;
  const errorCount    = cvList.filter(c => c.status === 'error').length;
  const pendingCount  = cvList.filter(c => c.status === 'pending').length;
  const processingIdx = cvList.findIndex(c => c.status === 'processing');

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="app-container">

      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <h1>BiasModel v2.5</h1>

        {/* Domain Selector */}
        <div className="domain-section">
          <label>Analysis Domain</label>
          <div className="domain-cards">
            {DOMAINS.map(d => (
              <button
                key={d.key}
                className={`domain-card ${activeDomain.key === d.key ? 'active' : ''}`}
                style={activeDomain.key === d.key ? { '--dc': d.color } : {}}
                onClick={() => handleDomainChange(d)}
              >
                <d.Icon size={16} />
                <div className="domain-card-text">
                  <span className="domain-card-name">{d.label}</span>
                  <span className="domain-card-sub">{d.sub}</span>
                </div>
                {activeDomain.key === d.key && <ChevronRight size={12} className="domain-check" />}
              </button>
            ))}
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="mode-tabs">
          <button className={`mode-tab ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')}>
            <BrainCircuit size={13} /> Manual
          </button>
          <button className={`mode-tab ${mode === 'batch' ? 'active' : ''}`} onClick={() => setMode('batch')}>
            <Layers size={13} /> {activeDomain.batchLabel}
          </button>
        </div>

        {mode === 'manual' ? (
          <>
            <div className="form-group">
              <label>Input Data</label>
              <textarea
                rows={5}
                value={formData.input_data}
                placeholder={activeDomain.placeholder}
                onChange={e => setFormData({ ...formData, input_data: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Sensitive Attributes</label>
              <input
                value={formData.sensitive_attrs}
                onChange={e => setFormData({ ...formData, sensitive_attrs: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Evaluation Criteria</label>
              <textarea
                rows={3}
                value={formData.criteria}
                onChange={e => setFormData({ ...formData, criteria: e.target.value })}
              />
            </div>

            {/* AI Prompt accordion */}
            <div className="prompt-accordion">
              <button className="prompt-toggle" onClick={() => setShowPrompt(p => !p)}>
                <span>AI System Prompt</span>
                {showPrompt ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              <AnimatePresence initial={false}>
                {showPrompt && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <textarea
                      className="prompt-textarea"
                      rows={6}
                      value={formData.system_prompt}
                      onChange={e => setFormData({ ...formData, system_prompt: e.target.value })}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button className="run-btn" style={{ '--rb': activeDomain.color }} onClick={handleRun} disabled={status === 'processing'}>
              {status === 'processing' ? 'Processing...' : `Run ${activeDomain.label} Pipeline`}
            </button>
          </>
        ) : (
          <>
            {/* Drop Zone */}
            <div
              className={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={e => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={26} />
              <span>Drop files here or click to browse</span>
              <small>{activeDomain.batchFileHint}</small>
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.txt"
                style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
            </div>

            {uploadError && (
              <div className="upload-error"><AlertTriangle size={13} /> {uploadError}</div>
            )}

            {cvList.length > 0 && (
              <div className="cv-list">
                <div className="cv-list-header">
                  <span>{cvList.length} file{cvList.length !== 1 ? 's' : ''} loaded</span>
                  <button className="clear-btn" onClick={clearAll} disabled={batchRunning}>Clear all</button>
                </div>
                {cvList.map(cv => (
                  <div key={cv.id} className={`cv-item status-${cv.status}`}>
                    <FileText size={12} />
                    <span className="cv-filename" title={cv.filename}>{cv.filename}</span>
                    <span className="cv-chars">{(cv.charCount / 1000).toFixed(1)}k</span>
                    <button className="remove-cv-btn" onClick={() => removeCv(cv.id)}
                      disabled={cv.status === 'processing' || batchRunning}><X size={11} /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="form-group">
              <label>Sensitive Attributes</label>
              <input value={formData.sensitive_attrs}
                onChange={e => setFormData({ ...formData, sensitive_attrs: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Evaluation Criteria</label>
              <textarea rows={3} value={formData.criteria}
                onChange={e => setFormData({ ...formData, criteria: e.target.value })} />
            </div>

            <button className="run-btn" style={{ '--rb': activeDomain.color }}
              onClick={runBatch} disabled={batchRunning || !cvList.length}>
              {batchRunning
                ? `Processing ${completedCount + errorCount + 1}/${cvList.length}...`
                : `Run ${cvList.length || ''} ${activeDomain.batchRunLabel} — ${activeDomain.label}`}
            </button>
          </>
        )}

        <div className="model-status">
          <div className="model-dot"><div className="dot green" />Local: Gemma-3</div>
          <div className="model-dot"><div className="dot amber" />Cloud: Gemini 2.5 Flash</div>
        </div>
      </aside>

      {/* ── MAIN VIEW ── */}
      <main className="main-view">

        {/* Domain Banner */}
        <div className="domain-banner" style={{ '--db': activeDomain.color }}>
          <activeDomain.Icon size={18} />
          <span>{activeDomain.task_type}</span>
        </div>

        {mode === 'manual' ? (
          <>
            <section className={`pipeline-viz ${loopActive ? 'loop-active' : ''}`}>
              <div className="loop-arrow" />
              <StepBox title="Predictor" active={currentStep === 'predictor'}
                icon={<BrainCircuit size={20} />}
                status={status === 'processing' && currentStep === 'predictor' ? 'Thinking...' : 'Gemma-3'}
                penaltyCount={penalties} accentColor={activeDomain.color} />
              <Connector active={currentStep === 'auditor' || currentStep === 'meta'} color={activeDomain.color} />
              <StepBox
                title={auditorSource === 'Local' ? 'Local Auditor' : 'Supreme Auditor'}
                active={currentStep === 'auditor'}
                icon={auditorSource === 'Local' ? <Monitor size={20} /> : <CloudLightning size={20} color="var(--accent)" />}
                status={status === 'processing' && currentStep === 'auditor' ? 'Auditing...' : auditorSource}
                highlight={auditorSource !== 'Local'} accentColor={activeDomain.color} />
              <Connector active={status === 'complete'} color={activeDomain.color} />
              <StepBox title="Final Output" active={status === 'complete'}
                icon={<ShieldCheck size={20} />}
                status={status === 'complete' ? 'Unbiased ✓' : 'Waiting...'}
                accentColor={activeDomain.color} />
            </section>

            <section className="console">
              <div className="console-title">
                <Terminal size={15} />
                <span>LIVE PIPELINE LOGS {attempt > 0 && `— ATTEMPT #${attempt}`}</span>
              </div>
              {logs.map(log => (
                <div key={log.id} className={`log-entry ${log.type}`}>
                  <div>{log.msg}</div>
                  {log.extra?.thoughts && (
                    <div className="thinking-block">
                      <strong>Internal Logic:</strong><br />{log.extra.thoughts}
                    </div>
                  )}
                </div>
              ))}
              <div ref={logEndRef} />
            </section>

            {finalResult && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="final-result" style={{ borderColor: activeDomain.color }}>
                <h2 className="final-result-title" style={{ color: activeDomain.color }}>
                  <ShieldCheck /> FINAL UNBIASED OUTPUT — {activeDomain.label.toUpperCase()}
                </h2>
                {finalResult}
              </motion.div>
            )}
          </>
        ) : (
          /* ── BATCH VIEW ── */
          cvList.length === 0 ? (
            <div className="batch-empty">
              <activeDomain.Icon size={52} style={{ color: activeDomain.color, opacity: 0.35 }} />
              <p>Upload files in the sidebar to begin batch processing.</p>
              <small>Active domain: <strong>{activeDomain.label}</strong> — {activeDomain.sub}</small>
            </div>
          ) : (
            <>
              <div className="batch-stats">
                <StatCard label="Total"    value={cvList.length} />
                <StatCard label="Complete" value={completedCount} color={activeDomain.color} />
                <StatCard label="Failed"   value={errorCount}    color="var(--error)" />
                <StatCard label="Pending"  value={pendingCount}  color="var(--text-dim)" />
                {batchRunning && processingIdx !== -1 && (
                  <div className="processing-label">
                    <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                      Processing {processingIdx + 1}/{cvList.length}
                    </motion.span>
                  </div>
                )}
              </div>
              <div className="cv-results-grid">
                {cvList.map(cv => (
                  <CvResultCard key={cv.id} cv={cv}
                    expanded={expandedCv === cv.id}
                    accentColor={activeDomain.color}
                    onToggle={() => setExpandedCv(expandedCv === cv.id ? null : cv.id)} />
                ))}
              </div>
            </>
          )
        )}
      </main>
    </div>
  );
}

// ── SUB-COMPONENTS ────────────────────────────────────────────────────────────

const StatCard = ({ label, value, color }) => (
  <div className="stat-card">
    <span className="stat-value" style={color ? { color } : {}}>{value}</span>
    <span className="stat-label">{label}</span>
  </div>
);

const CvResultCard = ({ cv, expanded, onToggle, accentColor }) => {
  const icons = {
    pending:    <Clock size={15} color="var(--text-dim)" />,
    processing: (
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} style={{ display: 'flex' }}>
        <BrainCircuit size={15} color={accentColor} />
      </motion.div>
    ),
    complete: <CheckCircle size={15} color={accentColor} />,
    error:    <XCircle size={15} color="var(--error)" />,
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`cv-result-card status-${cv.status}`}
      style={cv.status === 'complete' ? { borderColor: accentColor } : {}}>
      <div className="cv-result-header" onClick={cv.result ? onToggle : undefined}
        style={{ cursor: cv.result ? 'pointer' : 'default' }}>
        <div className="cv-result-meta">
          {icons[cv.status]}
          <div>
            <div className="cv-result-filename">{cv.filename}</div>
            <div className="cv-result-badge" style={
              cv.status === 'complete' ? { color: accentColor } :
              cv.status === 'error'    ? { color: 'var(--error)' } :
              cv.status === 'processing' ? { color: accentColor } :
              { color: 'var(--text-dim)' }
            }>
              {cv.status.charAt(0).toUpperCase() + cv.status.slice(1)}
            </div>
          </div>
        </div>
        {cv.result && <span className="expand-btn">{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>}
      </div>

      {cv.status === 'processing' && (
        <div className="cv-processing-track">
          <motion.div className="cv-processing-fill" style={{ background: accentColor }}
            animate={{ x: ['-100%', '100%'] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} />
        </div>
      )}

      <AnimatePresence initial={false}>
        {expanded && cv.result && (
          <motion.div key="body"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}
            className="cv-result-body">
            {cv.result}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const StepBox = ({ title, active, icon, status, penaltyCount, highlight, accentColor }) => (
  <motion.div
    className={`box ${active ? 'active' : ''}`}
    style={active && !highlight ? { borderColor: accentColor, boxShadow: `0 0 20px ${accentColor}44` }
         : highlight ? { borderColor: 'var(--accent)', boxShadow: '0 0 20px rgba(245,158,11,0.2)' }
         : {}}
    animate={active ? { scale: 1.05 } : { scale: 1 }}
  >
    {penaltyCount > 0 && <div className="penalty-badge">PENALTY x{penaltyCount}</div>}
    <div style={{ color: active ? (highlight ? 'var(--accent)' : accentColor) : 'var(--text-dim)', marginBottom: '0.5rem' }}>
      {icon}
    </div>
    <h3 style={highlight ? { color: 'var(--accent)' } : active ? { color: accentColor } : {}}>{title}</h3>
    <div className="status">{status}</div>
  </motion.div>
);

const Connector = ({ active, color }) => (
  <div className="connector">
    {active && (
      <motion.div className="particle" style={{ background: color, boxShadow: `0 0 10px ${color}` }}
        animate={{ left: ['0%', '100%'] }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
    )}
  </div>
);

export default App;
