/**
 * GOTTFRIED
 * Hermes Workers Management Hub - AI Reasoning Engine
 *
 * Named after Gottfried Wilhelm Leibniz, father of binary logic.
 * Gottfried is the brain. He thinks, reasons, plans, and decides.
 * He does NOT speak to users directly — Sophia is his voice.
 */

const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION
// ============================================

const REASONING_DIR = path.join(__dirname, '..', '..', 'data', 'reasoning');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ============================================
// GOTTFRIED ENGINE
// ============================================

class Gottfried {
  constructor(options = {}) {
    this.name = 'Gottfried';
    this.version = '1.0.0';
    this.reasoningLog = [];
    this.maxLogSize = options.maxLogSize || 1000;
    this.verbose = options.verbose || false;
  }

  log(level, message, context = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context
    };
    this.reasoningLog.push(entry);
    if (this.reasoningLog.length > this.maxLogSize) {
      this.reasoningLog.shift();
    }
    if (this.verbose || level === 'error') {
      console.log(`[GOTTFRIED] [${level.toUpperCase()}] ${message}`);
    }
  }

  /**
   * THINK: The core reasoning method.
   * Takes a task, breaks it down, decides strategy.
   */
  think(task) {
    this.log('info', `Thinking about task: ${task.description}`, { taskId: task.id });

    const analysis = this.analyze(task);
    const plan = this.plan(analysis);
    const delegation = this.delegate(plan);

    const result = {
      taskId: task.id,
      analysis,
      plan,
      delegation,
      confidence: this.calculateConfidence(analysis, plan),
      reasoning: this.summarizeReasoning()
    };

    this.log('info', `Reasoning complete. Confidence: ${result.confidence}`, { taskId: task.id });
    this.saveReasoning(task.id, result);

    return result;
  }

  /**
   * ANALYZE: Understand what the task is asking.
   */
  analyze(task) {
    const description = task.description.toLowerCase();

    const intents = [];
    const entities = [];

    // Intent detection
    if (/\b(schedule|calendar|remind|meeting|appointment)\b/.test(description)) {
      intents.push({ type: 'scheduling', confidence: 0.9, worker: 'iris' });
    }
    if (/\b(email|draft|inbox|send mail)\b/.test(description)) {
      intents.push({ type: 'communication', confidence: 0.85, worker: 'iris' });
    }
    if (/\b(research|find|lookup|search|gather)\b/.test(description)) {
      intents.push({ type: 'research', confidence: 0.8, worker: 'iris' });
    }
    if (/\b(post|tweet|x|social|engagement|like|follow|content)\b/.test(description)) {
      intents.push({ type: 'social-media', confidence: 0.9, worker: 'pheme' });
    }
    if (/\b(analytics|metrics|report|stats|performance)\b/.test(description)) {
      intents.push({ type: 'analytics', confidence: 0.75, worker: 'pheme' });
    }
    if (/\b(lead|prospect|sales|outreach|crm|pipeline|deal)\b/.test(description)) {
      intents.push({ type: 'sales', confidence: 0.9, worker: 'kairos' });
    }
    if (/\b(market|campaign|ad|advertise|promote|funnel)\b/.test(description)) {
      intents.push({ type: 'marketing', confidence: 0.85, worker: 'kairos' });
    }

    // Software / development intent — detected but no dedicated worker exists
    if (/\b(webapp|website|web app|web page|landing page|build app|code|develop|software|program|deploy|api|backend|frontend)\b/.test(description)) {
      intents.push({ type: 'software-development', confidence: 0.85, worker: null });
    }

    // Fallback: if NO intents matched at all, mark as unclear
    if (intents.length === 0) {
      intents.push({ type: 'unclear', confidence: 0.3, worker: null });
    }

    // If we have a software intent but no dev worker, downgrade confidence
    // and keep it flagged so Sophia can respond honestly
    const hasDevIntent = intents.some(i => i.type === 'software-development');
    const hasRoutable = intents.some(i => i.worker !== null);

    if (hasDevIntent && !hasRoutable) {
      // Software request with no developer on team — flag for honest response
      intents.unshift({ type: 'software-development', confidence: 0.5, worker: null, unroutable: true });
    }

    // Sort by confidence
    intents.sort((a, b) => b.confidence - a.confidence);

    // Extract entities (simple keyword extraction)
    const dateMatches = description.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]?\d{2,4}\b/g);
    const timeMatches = description.match(/\b\d{1,2}:\d{2}\s?(am|pm)?\b/gi);
    const urlMatches = description.match(/https?:\/\/[^\s]+/g);

    if (dateMatches) entities.push({ type: 'date', values: dateMatches });
    if (timeMatches) entities.push({ type: 'time', values: timeMatches });
    if (urlMatches) entities.push({ type: 'url', values: urlMatches });

    this.log('debug', `Analysis: ${intents.length} intents, ${entities.length} entities`, {
      topIntent: intents[0]?.type,
      confidence: intents[0]?.confidence
    });

    return { intents, entities, rawDescription: task.description };
  }

  /**
   * PLAN: Create an execution strategy.
   */
  plan(analysis) {
    const primaryIntent = analysis.intents[0];
    const steps = [];

    steps.push({
      step: 1,
      action: 'validate-input',
      description: 'Check task completeness and clarity',
      worker: primaryIntent.worker
    });

    if (analysis.entities.length > 0) {
      steps.push({
        step: 2,
        action: 'extract-entities',
        description: `Extract ${analysis.entities.map(e => e.type).join(', ')}`,
        worker: primaryIntent.worker,
        data: analysis.entities
      });
    }

    steps.push({
      step: steps.length + 1,
      action: 'execute-primary',
      description: `Execute ${primaryIntent.type} task`,
      worker: primaryIntent.worker,
      expectedOutput: this.inferOutputType(primaryIntent.type)
    });

    // Add verification step for high-confidence tasks
    if (primaryIntent.confidence > 0.85) {
      steps.push({
        step: steps.length + 1,
        action: 'self-verify',
        description: 'Verify output quality and completeness',
        worker: primaryIntent.worker
      });
    }

    this.log('debug', `Plan created: ${steps.length} steps`, { primaryWorker: primaryIntent.worker });

    return { steps, primaryWorker: primaryIntent.worker, estimatedComplexity: steps.length };
  }

  /**
   * DELEGATE: Decide how to distribute work.
   */
  delegate(plan) {
    const assignments = [];

    for (const step of plan.steps) {
      assignments.push({
        workerId: step.worker,
        task: step.description,
        step: step.step,
        action: step.action,
        priority: step.action === 'execute-primary' ? 'high' : 'normal'
      });
    }

    this.log('debug', `Delegation: ${assignments.length} assignments`, {
      workers: [...new Set(assignments.map(a => a.workerId))]
    });

    return { assignments, parallelizable: assignments.length > 1 };
  }

  /**
   * Calculate confidence score.
   */
  calculateConfidence(analysis, plan) {
    const topConfidence = analysis.intents[0]?.confidence || 0.5;
    const entityBonus = Math.min(analysis.entities.length * 0.05, 0.2);
    const complexityPenalty = Math.max(0, (plan.estimatedComplexity - 3) * 0.05);

    return Math.min(0.99, Math.max(0.1, topConfidence + entityBonus - complexityPenalty));
  }

  /**
   * Infer expected output type from intent.
   */
  inferOutputType(intentType) {
    const map = {
      'scheduling': 'calendar-event',
      'communication': 'draft-email',
      'research': 'research-report',
      'social-media': 'post-draft',
      'analytics': 'metrics-report',
      'sales': 'lead-list',
      'marketing': 'campaign-plan',
      'software-development': 'spec-document',
      'unclear': 'needs-clarification',
      'general-admin': 'task-completion'
    };
    return map[intentType] || 'generic-output';
  }

  /**
   * Summarize recent reasoning for reporting.
   */
  summarizeReasoning() {
    const recent = this.reasoningLog.slice(-5);
    return recent.map(e => `[${e.timestamp}] ${e.message}`).join('\n');
  }

  /**
   * Save reasoning to disk for audit trail.
   */
  saveReasoning(taskId, result) {
    try {
      ensureDir(REASONING_DIR);
      const file = path.join(REASONING_DIR, `${taskId}.json`);
      fs.writeFileSync(file, JSON.stringify(result, null, 2));
    } catch (err) {
      this.log('error', `Failed to save reasoning: ${err.message}`);
    }
  }

  /**
   * GENERATE: Produce content using the reasoning engine.
   * This is where LLM integration would go.
   */
  generateContent(prompt, context = {}) {
    this.log('info', `Generating content for: ${prompt.slice(0, 80)}...`);

    // Placeholder: In production, this calls the LLM API
    // For now, return a structured placeholder
    return {
      generated: true,
      content: `[Gottfried generated content placeholder for: ${prompt.slice(0, 60)}...]`,
      tokensUsed: 0,
      model: 'gottfried-v1',
      context
    };
  }

  /**
   * REFLECT: Self-evaluation after task completion.
   */
  reflect(taskId, outcome) {
    const reflection = {
      taskId,
      timestamp: new Date().toISOString(),
      success: outcome.success,
      lessons: outcome.success
        ? ['Task completed as planned']
        : ['Task failed, review delegation logic'],
      improvement: outcome.success
        ? null
        : 'Consider re-routing to different worker or breaking into smaller steps'
    };

    this.log('info', `Reflection for ${taskId}: ${outcome.success ? 'success' : 'failure'}`);
    return reflection;
  }
}

module.exports = { Gottfried };
