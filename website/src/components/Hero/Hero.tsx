import React from 'react';
import { motion } from 'framer-motion';
import { Terminal, type TerminalLine } from '../Terminal/Terminal';
import styles from './Hero.module.css';

const heroLines: TerminalLine[] = [
  { id: '1', type: 'command', content: 'gitgenie "Create a branch for authentication"' },
  { id: '2', type: 'empty', content: '', delay: 500 },
  { id: '3', type: 'system', content: '⚡ GITGENIE', delay: 100 },
  { id: '4', type: 'empty', content: '', delay: 100 },
  { id: '5', type: 'system', content: '◈ Analyzing repository...', delay: 800 },
  { id: '6', type: 'empty', content: '', delay: 100 },
  { id: '7', type: 'success', content: '✓ Repository detected', delay: 400 },
  { id: '8', type: 'success', content: '✓ Current branch: main', delay: 200 },
  { id: '9', type: 'success', content: '✓ Working tree: clean', delay: 200 },
  { id: '10', type: 'empty', content: '', delay: 100 },
  { id: '11', type: 'system', content: '◈ Creating execution plan...', delay: 1000 },
  { id: '12', type: 'empty', content: '', delay: 100 },
  { id: '13', type: 'action', content: '1. Create feature/authentication', delay: 500 },
  { id: '14', type: 'action', content: '2. Switch to the new branch', delay: 300 },
  { id: '15', type: 'action', content: '3. Verify repository status', delay: 300 },
  { id: '16', type: 'empty', content: '', delay: 100 },
  { id: '17', type: 'system', content: '◆ Executing...', delay: 600 },
  { id: '18', type: 'empty', content: '', delay: 100 },
  { id: '19', type: 'success', content: '✓ Branch created', delay: 400 },
  { id: '20', type: 'success', content: '✓ Switched to feature/authentication', delay: 300 },
  { id: '21', type: 'success', content: '✓ Repository verified', delay: 400 },
  { id: '22', type: 'empty', content: '', delay: 100 },
  { id: '23', type: 'system', content: '━━━━━━━━━━━━━━━━━━━━━━━━━━', delay: 200 },
  { id: '24', type: 'empty', content: '', delay: 100 },
  { id: '25', type: 'success', content: '✓ Task completed successfully', delay: 200 },
];

export const Hero: React.FC = () => {
  return (
    <section className={styles.heroSection}>
      <div className={styles.background}>
        <div className={styles.grid} />
        <div className={styles.glow} />
      </div>
      
      <div className={styles.content}>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className={styles.badge}>
            <motion.div 
              className={styles.badgePulse}
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
            GitGenie v1.0.0 is Live
          </div>
        </motion.div>

        <motion.h1 
          className={styles.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          Git commands are complicated.<br/>
          Just tell GitGenie what you want.
        </motion.h1>

        <motion.p 
          className={styles.subtitle}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          Your AI-powered Git assistant that understands natural language and safely handles Git workflows directly from your terminal.
        </motion.p>

        <motion.div 
          className={styles.terminalWrapper}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
        >
          <Terminal lines={heroLines} autoPlay={true} />
        </motion.div>
      </div>
    </section>
  );
};
