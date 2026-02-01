#!/usr/bin/env node

/**
 * Subscription Quota Tracker
 * Track usage across Claude MAX, ChatGPT Plus, and Gemini Advanced
 */

const fs = require('fs').promises;
const path = require('path');

const QUOTA_FILE = path.join(process.cwd(), 'memory', 'subscription-quotas.json');

class SubscriptionQuotaTracker {
  constructor() {
    this.quotas = {
      claude_max: {
        name: 'Claude MAX',
        monthly_cost: 200,
        reset_cycle: 'monthly',
        models: {
          'claude-opus-4-5': { weight: 10 },
          'claude-sonnet-4-5': { weight: 3 },
          'claude-haiku-4-5': { weight: 1 }
        },
        estimated_monthly_points: 10000,
        used_this_cycle: 0,
        last_reset: new Date().toISOString()
      },
      chatgpt_plus: {
        name: 'ChatGPT Plus',
        monthly_cost: 20,
        reset_cycle: '3_hours',
        models: {
          'gpt-5.2-codex': { weight: 1 },
          'gpt-5.1': { weight: 1 }
        },
        estimated_3h_messages: 50,
        used_this_window: 0,
        last_reset: new Date().toISOString()
      },
      gemini_advanced: {
        name: 'Gemini Advanced',  
        monthly_cost: 20,
        reset_cycle: 'unknown',
        models: {
          'gemini-2.5-pro': { weight: 1 },
          'gemini-2.5-flash': { weight: 0.5 }
        },
        estimated_daily_queries: 100,
        used_today: 0,
        last_reset: new Date().toISOString()
      }
    };
  }

  async load() {
    try {
      const data = await fs.readFile(QUOTA_FILE, 'utf8');
      this.quotas = JSON.parse(data);
    } catch (err) {
      // File doesn't exist, use defaults
      await this.save();
    }
  }

  async save() {
    await fs.mkdir(path.dirname(QUOTA_FILE), { recursive: true });
    await fs.writeFile(QUOTA_FILE, JSON.stringify(this.quotas, null, 2));
  }

  async trackUsage(provider, model, tokensUsed = 1) {
    await this.load();
    
    // Reset if needed
    this.checkResets();
    
    // Track usage
    if (provider === 'anthropic') {
      const weight = this.quotas.claude_max.models[model]?.weight || 1;
      this.quotas.claude_max.used_this_cycle += weight;
    } else if (provider === 'openai-codex') {
      this.quotas.chatgpt_plus.used_this_window += 1;
    } else if (provider === 'google-gemini-cli') {
      this.quotas.gemini_advanced.used_today += 1;
    }
    
    await this.save();
  }

  checkResets() {
    const now = new Date();
    
    // ChatGPT Plus - 3 hour windows
    const chatGPTLast = new Date(this.quotas.chatgpt_plus.last_reset);
    if (now - chatGPTLast > 3 * 60 * 60 * 1000) {
      this.quotas.chatgpt_plus.used_this_window = 0;
      this.quotas.chatgpt_plus.last_reset = now.toISOString();
    }
    
    // Gemini - daily reset (assumed)
    const geminiLast = new Date(this.quotas.gemini_advanced.last_reset);
    if (now.getDate() !== geminiLast.getDate()) {
      this.quotas.gemini_advanced.used_today = 0;
      this.quotas.gemini_advanced.last_reset = now.toISOString();
    }
    
    // Claude MAX - monthly
    const claudeLast = new Date(this.quotas.claude_max.last_reset);
    if (now.getMonth() !== claudeLast.getMonth()) {
      this.quotas.claude_max.used_this_cycle = 0;
      this.quotas.claude_max.last_reset = now.toISOString();
    }
  }

  async getRecommendation() {
    await this.load();
    this.checkResets();
    
    const recommendations = [];
    
    // Check ChatGPT quota
    const chatGPTRemaining = this.quotas.chatgpt_plus.estimated_3h_messages - 
                             this.quotas.chatgpt_plus.used_this_window;
    if (chatGPTRemaining > 10) {
      recommendations.push({
        provider: 'openai-codex',
        model: 'gpt-5.2-codex',
        reason: `${chatGPTRemaining} messages left in window`,
        priority: 1
      });
    }
    
    // Check Claude quota
    const claudePercent = (this.quotas.claude_max.used_this_cycle / 
                          this.quotas.claude_max.estimated_monthly_points) * 100;
    if (claudePercent < 80) {
      recommendations.push({
        provider: 'anthropic',
        model: 'claude-haiku-4-5', // Start with cheapest
        reason: `${Math.round(100 - claudePercent)}% monthly quota remaining`,
        priority: 2
      });
    }
    
    // Always recommend local as fallback
    recommendations.push({
      provider: 'ollama',
      model: 'qwen3:32b',
      reason: 'Free local model',
      priority: 3
    });
    
    return recommendations;
  }

  async report() {
    await this.load();
    this.checkResets();
    
    console.log('\n📊 Subscription Usage Report\n');
    
    // Claude MAX
    const claudePercent = (this.quotas.claude_max.used_this_cycle / 
                          this.quotas.claude_max.estimated_monthly_points) * 100;
    console.log(`Claude MAX ($200/mo):`);
    console.log(`  Used: ${claudePercent.toFixed(1)}% of monthly quota`);
    console.log(`  Cost efficiency: $${(200 * claudePercent / 100).toFixed(2)} used\n`);
    
    // ChatGPT Plus  
    const chatGPTPercent = (this.quotas.chatgpt_plus.used_this_window / 
                           this.quotas.chatgpt_plus.estimated_3h_messages) * 100;
    console.log(`ChatGPT Plus ($20/mo):`);
    console.log(`  Used: ${this.quotas.chatgpt_plus.used_this_window}/${this.quotas.chatgpt_plus.estimated_3h_messages} messages this window`);
    console.log(`  Next reset: ~${new Date(Date.parse(this.quotas.chatgpt_plus.last_reset) + 3*60*60*1000).toLocaleTimeString()}\n`);
    
    // Total value
    const totalMonthlyCost = 200 + 20 + 20; // Claude + ChatGPT + Gemini
    console.log(`💰 Total Subscription Value: $${totalMonthlyCost}/month`);
    console.log(`🎯 Recommendation: ${(await this.getRecommendation())[0].model} (${(await this.getRecommendation())[0].reason})`);
  }
}

// CLI usage
if (require.main === module) {
  const tracker = new SubscriptionQuotaTracker();
  const command = process.argv[2];
  
  (async () => {
    switch(command) {
      case 'track':
        const [provider, model] = process.argv.slice(3);
        await tracker.trackUsage(provider, model);
        console.log(`✅ Tracked usage for ${model}`);
        break;
        
      case 'recommend':
        const recs = await tracker.getRecommendation();
        console.log('🎯 Model Recommendations:');
        recs.forEach(r => console.log(`  ${r.priority}. ${r.model} - ${r.reason}`));
        break;
        
      case 'report':
      default:
        await tracker.report();
        break;
    }
  })();
}

module.exports = SubscriptionQuotaTracker;