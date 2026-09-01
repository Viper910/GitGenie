import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, MessageSquare, TerminalSquare, Search, BrainCircuit, ShieldCheck, Play, CheckCircle } from 'lucide-react';
import styles from './HowItWorks.module.css';

const steps = [
  { id: 0, label: 'You', icon: <User size={20} /> },
  { id: 1, label: 'Natural Language Request', icon: <MessageSquare size={20} /> },
  { id: 2, label: 'GitGenie CLI', icon: <TerminalSquare size={20} /> },
  { id: 3, label: 'Repository Analysis', icon: <Search size={20} /> },
  { id: 4, label: 'AI Planning', icon: <BrainCircuit size={20} /> },
  { id: 5, label: 'Security Validation', icon: <ShieldCheck size={20} /> },
  { id: 6, label: 'Git Execution', icon: <Play size={20} /> },
  { id: 7, label: 'Verified Result', icon: <CheckCircle size={20} /> },
];

export const HowItWorks: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="how-it-works" className={styles.howItWorksSection}>
      <div className={styles.header}>
        <motion.h2 
          className={styles.title}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          How It Works
        </motion.h2>
        <motion.p 
          className={styles.subtitle}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          An intelligent pipeline built for accuracy and safety.
        </motion.p>
      </div>

      <div className={styles.pipeline}>
        {steps.map((step, index) => (
          <React.Fragment key={step.id}>
            <motion.div 
              className={`${styles.node} ${activeStep >= index ? styles.active : ''}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ delay: index * 0.1 }}
            >
              <div className={styles.icon}>{step.icon}</div>
              {step.label}
            </motion.div>
            
            {index < steps.length - 1 && (
              <div className={styles.connector}>
                <motion.div 
                  className={styles.connectorFill}
                  initial={{ height: '0%' }}
                  animate={{ height: activeStep > index ? '100%' : '0%' }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
};
