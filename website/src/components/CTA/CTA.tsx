import React from 'react';
import { motion } from 'framer-motion';
import { Copy } from 'lucide-react';
import styles from './CTA.module.css';

export const CTA: React.FC = () => {
  return (
    <section id="install" className={styles.ctaSection}>
      <div className={styles.glow} />
      
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <h2 className={styles.title}>Stop memorizing Git commands.</h2>
        <p className={styles.subtitle}>Tell GitGenie what you want to do.</p>
        
        <div className={styles.actions}>
          <div className={styles.buttonGroup}>
            <a href="https://npmjs.com/package/gitgenie" className={styles.primaryBtn}>
              Install GitGenie
            </a>
            <a href="https://github.com/Viper910/GitGenie" className={styles.secondaryBtn}>
              View on GitHub
            </a>
          </div>
          
          <div className={styles.installCode}>
            <span>$</span> npm install -g gitgenie
            <button aria-label="Copy to clipboard" style={{ color: 'inherit', display: 'flex' }}>
              <Copy size={16} />
            </button>
          </div>
        </div>
      </motion.div>
    </section>
  );
};
