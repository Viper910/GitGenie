import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, type TerminalLine } from '../Terminal/Terminal';
import styles from './Playground.module.css';

const scenarios: Record<string, TerminalLine[]> = {
  init: [
    { id: '1', type: 'command', content: 'gitgenie "Initialize a repository"' },
    { id: '2', type: 'system', content: '◈ Analyzing current directory...', delay: 600 },
    { id: '3', type: 'success', content: '✓ No existing git repository found', delay: 300 },
    { id: '4', type: 'system', content: '◈ Creating execution plan...', delay: 600 },
    { id: '5', type: 'action', content: '1. Initialize git repository (main branch)', delay: 200 },
    { id: '6', type: 'action', content: '2. Create standard Node.js .gitignore', delay: 200 },
    { id: '7', type: 'system', content: '◆ Executing...', delay: 500 },
    { id: '8', type: 'success', content: '✓ Repository initialized', delay: 300 },
    { id: '9', type: 'success', content: '✓ .gitignore created', delay: 200 },
  ],
  commit: [
    { id: '1', type: 'command', content: 'gitgenie "Commit my changes"' },
    { id: '2', type: 'system', content: '◈ Analyzing repository...', delay: 600 },
    { id: '3', type: 'success', content: '✓ 3 modified files detected', delay: 400 },
    { id: '4', type: 'system', content: '◈ Generating intelligent commit message...', delay: 800 },
    { id: '5', type: 'action', content: '1. Stage all tracked modifications', delay: 200 },
    { id: '6', type: 'action', content: '2. Commit with message: "feat: add user authentication flow"', delay: 200 },
    { id: '7', type: 'system', content: '◆ Executing...', delay: 400 },
    { id: '8', type: 'success', content: '✓ Files staged', delay: 200 },
    { id: '9', type: 'success', content: '✓ Commit created', delay: 200 },
  ],
  conflict: [
    { id: '1', type: 'command', content: 'gitgenie "Resolve the merge conflicts"' },
    { id: '2', type: 'system', content: '◈ Analyzing repository...', delay: 600 },
    { id: '3', type: 'warning', content: '! 2 files with merge conflicts detected', delay: 400 },
    { id: '4', type: 'system', content: '◈ AI analyzing conflict in package.json...', delay: 800 },
    { id: '5', type: 'system', content: '  Explanation: Remote added "axios", Local added "framer-motion"', delay: 600 },
    { id: '6', type: 'action', content: '1. Combine additions for package.json', delay: 200 },
    { id: '7', type: 'system', content: '◆ Executing...', delay: 500 },
    { id: '8', type: 'success', content: '✓ Conflicts resolved intelligently', delay: 300 },
  ]
};

export const Playground: React.FC = () => {
  const [activeScenario, setActiveScenario] = useState<string>('init');
  const [terminalKey, setTerminalKey] = useState<number>(0);

  const handleSelect = (key: string) => {
    if (activeScenario !== key) {
      setActiveScenario(key);
      setTerminalKey(prev => prev + 1); // Force re-mount of Terminal component
    }
  };

  return (
    <section id="playground" className={styles.playgroundSection}>
      <div className={styles.header}>
        <h2 className={styles.title}>See it in action</h2>
      </div>

      <div className={styles.container}>
        <div className={styles.selector}>
          <button 
            className={`${styles.commandBtn} ${activeScenario === 'init' ? styles.active : ''}`}
            onClick={() => handleSelect('init')}
          >
            "Initialize a repository"
          </button>
          <button 
            className={`${styles.commandBtn} ${activeScenario === 'commit' ? styles.active : ''}`}
            onClick={() => handleSelect('commit')}
          >
            "Commit my changes"
          </button>
          <button 
            className={`${styles.commandBtn} ${activeScenario === 'conflict' ? styles.active : ''}`}
            onClick={() => handleSelect('conflict')}
          >
            "Resolve the merge conflicts"
          </button>
        </div>

        <div className={styles.terminalWrapper}>
          <AnimatePresence mode="wait">
            <motion.div
              key={terminalKey}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Terminal lines={scenarios[activeScenario]} autoPlay={true} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
};
