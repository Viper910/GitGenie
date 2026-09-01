import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';
import styles from './Security.module.css';

export const Security: React.FC = () => {
  const [activeNode, setActiveNode] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveNode((prev) => (prev + 1) % 5);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const nodes = [
    { id: 0, label: 'Natural Language Request' },
    { id: 1, label: 'AI Workflow Planning' },
    { id: 2, label: 'Security & Policy Validation', secure: true },
    { id: 3, label: 'Git Executor' },
    { id: 4, label: 'Repository Update' },
  ];

  return (
    <section id="security" className={styles.securitySection}>
      <div className={styles.container}>
        <div className={styles.header}>
          <motion.h2 
            className={styles.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Powerful automation.<br/>Built with safety in mind.
          </motion.h2>
          <motion.p 
            className={styles.subtitle}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            GitGenie doesn't blindly execute AI-generated shell commands. Every action passes through a strict policy engine.
          </motion.p>
        </div>

        <div className={styles.pipeline}>
          {nodes.map((node, index) => (
            <React.Fragment key={node.id}>
              <motion.div 
                className={`${styles.node} ${activeNode >= index ? styles.active : ''} ${node.secure && activeNode >= index ? styles.secure : ''}`}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.2 }}
              >
                {node.secure && activeNode >= index && <Shield size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'text-bottom' }} />}
                {node.label}
              </motion.div>
              
              {index < nodes.length - 1 && (
                <div className={styles.connector}>
                  <motion.div 
                    className={styles.connectorFill}
                    initial={{ height: '0%' }}
                    animate={{ height: activeNode > index ? '100%' : '0%' }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        <div className={styles.details}>
          <motion.div 
            className={styles.detailCard}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
          >
            <div className={styles.detailTitle}>No Unrestricted Shell Access</div>
            <div className={styles.detailText}>
              Unlike generic AI coding assistants, GitGenie uses a structured Git execution engine. It cannot run arbitrary shell commands on your machine.
            </div>
          </motion.div>
          <motion.div 
            className={styles.detailCard}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6 }}
          >
            <div className={styles.detailTitle}>Automatic Secret Detection</div>
            <div className={styles.detailText}>
              GitGenie halts operations immediately if it detects API keys, passwords, or .env files in your staged changes, preventing accidental credential leaks.
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
