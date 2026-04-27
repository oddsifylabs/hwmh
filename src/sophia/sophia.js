/**
 * SOPHIA HERMES
 * Hermes Workers Management Hub - Manager Persona
 *
 * Sophia is the voice. She speaks to the Director, receives commands,
 * consults Gottfried (the brain) for reasoning, and delegates to workers.
 * She does NOT think on her own — she thinks through Gottfried.
 */

const { Gottfried } = require('../gottfried/gottfried');

// ============================================
// SOPHIA MANAGER
// ============================================

class Sophia {
  constructor(options = {}) {
    this.name = 'Sophia Hermes';
    this.role = 'orchestrator';
    this.gottfried = new Gottfried(options.gottfried || {});
    this.taskHistory = [];
    this.maxHistory = options.maxHistory || 500;
    this.directorName = options.directorName || 'Director';
    this.onDelegate = options.onDelegate || null;   // callback(assignments)
    this.onNotify = options.onNotify || null;       // callback(notification)
    this.pendingContexts = new Map();               // taskId -> { chatId, source, user }
  }

  log(level, message, meta = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      agent: this.name,
      level,
      message,
      ...meta
    };
    this.taskHistory.push(entry);
    if (this.taskHistory.length > this.maxHistory) this.taskHistory.shift();

    const prefix = `[SOPHIA] [${level.toUpperCase()}]`;
    console.log(`${prefix} ${message}`);
  }

  /**
   * RECEIVE: The Director sends a command.
   * This is the main entry point.
   */
  async receive(command) {
    this.log('info', `Received command: ${command.description}`, { source: command.source });

    // Consult Gottfried for reasoning
    const reasoning = this.gottfried.think(command);

    // Formulate response to Director
    const response = this.formulateResponse(reasoning);

    // If approved, delegate to workers
    if (reasoning.confidence > 0.5) {
      const delegationResult = await this.delegateToWorkers(reasoning.delegation, command);
      response.delegation = delegationResult;
    }

    this.log('info', `Command processed. Confidence: ${reasoning.confidence}`, {
      taskId: command.id,
      primaryWorker: reasoning.plan.primaryWorker
    });

    return response;
  }

  /**
   * FORMULATE RESPONSE: What to say back to the Director.
   */
  formulateResponse(reasoning) {
    const { analysis, plan, confidence } = reasoning;
    const primaryIntent = analysis.intents[0];
    const primaryWorker = plan.primaryWorker;
    const workerNames = {
      iris: 'Iris Hermes (Admin Assistant)',
      pheme: 'Pheme Hermes (Social Media Manager)',
      kairos: 'Kairos Hermes (Sales & Marketing)'
    };

    let message = '';

    if (confidence > 0.85) {
      message = `Understood. I'm delegating this to ${workerNames[primaryWorker] || primaryWorker}. Estimated complexity: ${plan.estimatedComplexity} steps.`;
    } else if (confidence >= 0.5) {
      // Medium confidence — still route it, but note the ambiguity
      const intentList = analysis.intents.map(i => i.type).join(', ');
      message = `Received. This looks like ${primaryIntent.type} to me — I'm routing it to ${workerNames[primaryWorker] || primaryWorker}. If that's not right, let me know and I'll reassign.`;
    } else {
      // Very low confidence — ask for clarification but still be helpful
      message = `I want to make sure I handle this correctly. Could you tell me if this is related to: scheduling, research, social media, sales, or something else?`;
    }

    const response = {
      from: this.name,
      to: this.directorName,
      message,
      reply: message, // Conversational reply for chat UI
      confidence,
      suggestedWorker: primaryWorker,
      reasoning: reasoning.reasoning,
      requiresClarification: confidence < 0.5
    };
    return response;
  }

  /**
   * DELEGATE TO WORKERS: Push tasks to worker queues.
   */
  async delegateToWorkers(delegation, command) {
    const results = [];

    for (const assignment of delegation.assignments) {
      const taskId = assignment.taskId || require('uuid').v4();

      // Store context so we can notify the original sender on completion
      this.pendingContexts.set(taskId, {
        parentTaskId: command.id,
        chatId: command.chatId,
        source: command.source,
        user: command.user,
        originalDescription: command.description
      });

      // Push to actual queue via callback
      if (this.onDelegate) {
        this.onDelegate([{ ...assignment, taskId, parentTaskId: command.id }]);
      }

      this.log('info', `Delegated to @${assignment.workerId}: ${assignment.task}`, {
        step: assignment.step,
        priority: assignment.priority,
        taskId
      });

      results.push({
        workerId: assignment.workerId,
        assigned: true,
        task: assignment.task,
        taskId,
        status: 'queued'
      });
    }

    return { assignments: results, total: results.length };
  }

  /**
   * STATUS REPORT: Summarize everything to the Director.
   */
  statusReport(workersState = {}) {
    const report = {
      from: this.name,
      timestamp: new Date().toISOString(),
      summary: {
        activeWorkers: Object.keys(workersState).length,
        recentCommands: this.taskHistory.filter(e => e.level === 'info').length,
        systemHealth: 'operational'
      },
      workers: workersState,
      message: `All systems operational. ${Object.keys(workersState).length} workers standing by.`,
      nextActions: this.suggestNextActions(workersState)
    };

    this.log('info', 'Status report generated');
    return report;
  }

  /**
   * SUGGEST NEXT ACTIONS: Proactive suggestions.
   */
  suggestNextActions(workersState) {
    const suggestions = [];

    for (const [workerId, state] of Object.entries(workersState)) {
      if (state.status === 'idle') {
        suggestions.push(`${workerId} is idle. Consider assigning a ${this.getWorkerRole(workerId)} task.`);
      }
    }

    const overloaded = Object.entries(workersState)
      .filter(([_, s]) => (s.queueLength || 0) > 5)
      .map(([id, _]) => id);

    if (overloaded.length > 0) {
      suggestions.push(`Workers ${overloaded.join(', ')} have long queues. Consider prioritizing or adding workers.`);
    }

    return suggestions;
  }

  getWorkerRole(workerId) {
    const roles = {
      iris: 'admin',
      pheme: 'social media',
      kairos: 'sales or marketing'
    };
    return roles[workerId] || 'general';
  }

  /**
   * HANDLE WORKER COMPLETION: Process results from workers.
   */
  async handleCompletion(workerId, result) {
    this.log('info', `Task completed by @${workerId}`, { success: result.success, taskId: result.taskId });

    // Get the original context
    const ctx = this.pendingContexts.get(result.taskId);

    // Reflect through Gottfried
    const reflection = this.gottfried.reflect(result.taskId, result);

    // Notify the original sender if we have context
    if (ctx && this.onNotify) {
      this.onNotify({
        type: 'completion',
        taskId: result.taskId,
        workerId,
        success: result.success,
        result: result.result,
        error: result.error,
        chatId: ctx.chatId,
        source: ctx.source,
        user: ctx.user,
        originalDescription: ctx.originalDescription
      });
    }

    // Clean up context
    this.pendingContexts.delete(result.taskId);

    // Notify Director if high-priority or failed
    if (!result.success || result.priority === 'high') {
      return {
        notifyDirector: true,
        message: result.success
          ? `@${workerId} completed a high-priority task successfully.`
          : `@${workerId} encountered an issue. Review required.`,
        reflection
      };
    }

    return { notifyDirector: false, reflection };
  }
}

module.exports = { Sophia };
