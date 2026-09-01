import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './Terminal.module.css';

export interface TerminalLine {
  id: string;
  type: 'command' | 'system' | 'success' | 'warning' | 'error' | 'action' | 'empty';
  content: string;
  delay?: number;
}

interface TerminalProps {
  lines: TerminalLine[];
  autoPlay?: boolean;
  typingSpeed?: number;
  onComplete?: () => void;
}

export const Terminal: React.FC<TerminalProps> = ({ 
  lines, 
  autoPlay = true,
  typingSpeed = 40,
  onComplete
}) => {
  const [visibleLines, setVisibleLines] = useState<TerminalLine[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [typedChars, setTypedChars] = useState(0);

  useEffect(() => {
    if (!autoPlay || currentLineIndex >= lines.length) {
      if (currentLineIndex >= lines.length && onComplete) {
        onComplete();
      }
      return;
    }

    const currentLine = lines[currentLineIndex];

    if (currentLine.type === 'command') {
      if (typedChars < currentLine.content.length) {
        const timeout = setTimeout(() => {
          setTypedChars(prev => prev + 1);
        }, typingSpeed + (Math.random() * 20)); // Add slight randomness for realistic typing
        return () => clearTimeout(timeout);
      } else {
        const timeout = setTimeout(() => {
          setVisibleLines(prev => [...prev, { ...currentLine }]);
          setCurrentLineIndex(prev => prev + 1);
          setTypedChars(0);
        }, 300);
        return () => clearTimeout(timeout);
      }
    } else {
      // Non-command lines appear immediately or after their specified delay
      const delay = currentLine.delay || 150;
      const timeout = setTimeout(() => {
        setVisibleLines(prev => [...prev, currentLine]);
        setCurrentLineIndex(prev => prev + 1);
      }, delay);
      return () => clearTimeout(timeout);
    }
  }, [currentLineIndex, typedChars, autoPlay, lines, typingSpeed, onComplete]);

  return (
    <motion.div 
      className={styles.terminalContainer}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <div className={styles.header}>
        <div className={styles.controls}>
          <div className={`${styles.control} ${styles.close}`} />
          <div className={`${styles.control} ${styles.minimize}`} />
          <div className={`${styles.control} ${styles.maximize}`} />
        </div>
        <div className={styles.title}>gitgenie — bash</div>
      </div>
      <div className={styles.body}>
        <AnimatePresence>
          {visibleLines.map((line) => (
            <motion.div 
              key={line.id} 
              className={styles.line}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {line.type === 'command' && <span className={styles.prompt}>$</span>}
              <span className={styles[line.type]}>
                {line.type === 'command' ? line.content : line.content}
              </span>
            </motion.div>
          ))}
          
          {/* Active typing line */}
          {currentLineIndex < lines.length && lines[currentLineIndex].type === 'command' && (
            <div className={styles.line}>
              <span className={styles.prompt}>$</span>
              <span className={styles.command}>
                {lines[currentLineIndex].content.substring(0, typedChars)}
              </span>
              <motion.span 
                className={styles.cursor}
                animate={{ opacity: [1, 0] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
              />
            </div>
          )}

          {/* Idle cursor at the end */}
          {currentLineIndex >= lines.length && (
            <div className={styles.line}>
              <span className={styles.prompt}>$</span>
              <motion.span 
                className={styles.cursor}
                animate={{ opacity: [1, 0] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
              />
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
