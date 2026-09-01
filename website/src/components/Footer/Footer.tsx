import React from 'react';
import { TerminalSquare } from 'lucide-react';
import styles from './Footer.module.css';

export const Footer: React.FC = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <a href="#" className={styles.logo}>
          <TerminalSquare className={styles.logoIcon} size={24} />
          GitGenie
        </a>
        
        <p className={styles.description}>
          Your AI-powered Git assistant, right in the terminal.
          Manage Git using natural language instead of remembering complex commands.
        </p>

        <div className={styles.links}>
          <a href="#" className={styles.link}>Documentation</a>
          <a href="#" className={styles.link}>GitHub</a>
          <a href="#" className={styles.link}>Issues</a>
          <a href="#" className={styles.link}>Privacy Policy</a>
          <a href="#" className={styles.link}>License</a>
        </div>

        <div className={styles.copyright}>
          © {new Date().getFullYear()} GitGenie. Built for developers.
        </div>
      </div>
    </footer>
  );
};
