import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Terminal, Settings, ShieldAlert } from 'lucide-react';
import styles from './Documentation.module.css';

const tabs = [
  { id: 'quick-start', label: 'Quick Start', icon: <Play size={18} /> },
  { id: 'commands', label: 'Command Reference', icon: <Terminal size={18} /> },
  { id: 'config', label: 'Configuration', icon: <Settings size={18} /> },
  { id: 'security', label: 'Security & Policy', icon: <ShieldAlert size={18} /> },
];

export const Documentation: React.FC = () => {
  const [activeTab, setActiveTab] = useState(tabs[0].id);

  const renderContent = () => {
    switch (activeTab) {
      case 'quick-start':
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <h3>Quick Start Guide</h3>
            <p>Get up and running with GitGenie globally on your system in under 2 minutes.</p>
            
            <h4>1. Installation</h4>
            <p>Install GitGenie globally via npm. Ensure you have Node.js 18 or higher.</p>
            <div className={styles.codeBlock}>
              npm install -g gitgenie
            </div>

            <h4>2. Set API Key</h4>
            <p>GitGenie uses OpenRouter by default. Set your API key in your environment.</p>
            <div className={styles.codeBlock}>
              <span className={styles.comment}># Windows (PowerShell)</span><br/>
              $env:OPENROUTER_API_KEY="sk-or-v1-..."<br/><br/>
              <span className={styles.comment}># Mac / Linux</span><br/>
              export OPENROUTER_API_KEY="sk-or-v1-..."
            </div>

            <h4>3. Magic Time</h4>
            <p>Navigate to any project and just tell GitGenie what you want to do.</p>
            <div className={styles.codeBlock}>
              gitgenie "Initialize a repository and create a first commit"
            </div>
          </motion.div>
        );
      case 'commands':
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <h3>Natural Language Commands</h3>
            <p>You no longer need to remember Git syntax. GitGenie translates your intent into secure Git workflows.</p>
            
            <h4>Branch Management</h4>
            <ul>
              <li><code>gitgenie "Create a branch for auth integration"</code></li>
              <li><code>gitgenie "Rename my current branch to feature/auth"</code></li>
              <li><code>gitgenie "Sync my branch with remote main"</code></li>
            </ul>

            <h4>Committing</h4>
            <ul>
              <li><code>gitgenie "Add everything and commit"</code></li>
              <li><code>gitgenie "Commit only the modified CSS files"</code></li>
              <li><code>gitgenie "Undo my last commit but keep the changes"</code></li>
            </ul>

            <h4>Collaboration</h4>
            <ul>
              <li><code>gitgenie "Push my work"</code></li>
              <li><code>gitgenie "Fetch the latest changes and resolve any conflicts"</code></li>
              <li><code>gitgenie "Stash my changes, pull main, and pop the stash"</code></li>
            </ul>
          </motion.div>
        );
      case 'config':
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <h3>Configuration</h3>
            <p>Customize GitGenie by placing a <code>.gitgenierc.json</code> file in your project root or home directory.</p>
            
            <h4>Available Options</h4>
            <div className={styles.codeBlock}>
{`{
  "model": "nvidia/nemotron-3-ultra",
  "theme": "neon-cyan",
  "security": {
    "requireConfirmation": true,
    "blockForcePush": true
  }
}`}
            </div>
            <ul>
              <li><strong>model</strong>: The OpenRouter model used for natural language processing.</li>
              <li><strong>theme</strong>: CLI color scheme. Options: <code>neon-cyan</code>, <code>dracula</code>, <code>minimal</code>.</li>
              <li><strong>security</strong>: Control how strict GitGenie is before executing destructive commands.</li>
            </ul>
          </motion.div>
        );
      case 'security':
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <h3>Security & Policies</h3>
            <p>GitGenie incorporates built-in guardrails to protect your code.</p>
            
            <h4>1. Secret Detection</h4>
            <p>GitGenie automatically scans modified files for API keys, passwords, and `.env` files before committing. If secrets are detected, the commit is aborted immediately.</p>

            <h4>2. Destructive Operations</h4>
            <p>GitGenie will never execute the following commands without explicit Y/N terminal confirmation:</p>
            <ul>
              <li><code>git push --force</code></li>
              <li><code>git reset --hard</code></li>
              <li><code>git clean -fd</code></li>
              <li><code>git branch -D</code></li>
            </ul>

            <h4>3. No Arbitrary Shell Execution</h4>
            <p>GitGenie does not give the AI free shell access. It maps your intent to a strictly defined, hardcoded set of structured Git actions (e.g., <code>CREATE_COMMIT</code>, <code>STAGE_FILES</code>).</p>
          </motion.div>
        );
      default:
        return null;
    }
  };

  return (
    <section id="docs" className={styles.docsSection}>
      <div className={styles.container}>
        <div className={styles.header}>
          <motion.h2 
            className={styles.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Full Documentation
          </motion.h2>
          <motion.p 
            className={styles.subtitle}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            Everything you need to master GitGenie.
          </motion.p>
        </div>

        <motion.div 
          className={styles.docsViewer}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          <div className={styles.sidebar}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
          <div className={styles.content}>
            <AnimatePresence mode="wait">
              <div key={activeTab}>
                {renderContent()}
              </div>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
