import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TerminalSquare } from 'lucide-react';
import styles from './Navbar.module.css';

export const Navbar: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.header 
      className={`${styles.navbar} ${scrolled ? styles.scrolled : ''}`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <a href="#" className={styles.logo}>
        <TerminalSquare className={styles.logoIcon} size={24} />
        GitGenie
      </a>

      <nav className={styles.links}>
        <a href="#features" className={styles.link}>Features</a>
        <a href="#how-it-works" className={styles.link}>How It Works</a>
        <a href="#security" className={styles.link}>Security</a>
        <a href="#docs" className={styles.link}>Docs</a>
        <a href="#github" className={styles.link}>GitHub</a>
      </nav>

      <div className={styles.actions}>
        <a href="#install" className={styles.cta}>
          Install GitGenie
        </a>
      </div>
    </motion.header>
  );
};
