import React from 'react';
import { motion } from 'framer-motion';
import { 
  MessageSquare, 
  Search, 
  GitBranch, 
  MessageCircle, 
  AlertTriangle, 
  ShieldCheck, 
  Key, 
  TerminalSquare 
} from 'lucide-react';
import styles from './Features.module.css';

const features = [
  {
    icon: <MessageSquare size={24} />,
    title: 'Natural Language Git',
    description: 'Tell GitGenie what you want to do in plain English. No need to memorize complex command flags.'
  },
  {
    icon: <Search size={24} />,
    title: 'Intelligent Analysis',
    description: 'GitGenie inspects your repository state before taking action, ensuring operations make contextual sense.'
  },
  {
    icon: <GitBranch size={24} />,
    title: 'Smart Workflows',
    description: 'Combine multiple operations natively. GitGenie chains branches, stashes, and commits intelligently.'
  },
  {
    icon: <MessageCircle size={24} />,
    title: 'AI-Powered Commits',
    description: 'Auto-generate meaningful commit messages based on diff analysis, keeping your history professional.'
  },
  {
    icon: <AlertTriangle size={24} />,
    title: 'Conflict Assistance',
    description: 'Get clear, human-readable explanations of merge conflicts and intelligent suggestions to resolve them.'
  },
  {
    icon: <ShieldCheck size={24} />,
    title: 'Safety First',
    description: 'GitGenie detects dangerous operations (like force pushes) and requires explicit confirmation.'
  },
  {
    icon: <Key size={24} />,
    title: 'Secret Protection',
    description: 'Built-in secret detection prevents accidental commits of API keys, .env files, and sensitive credentials.'
  },
  {
    icon: <TerminalSquare size={24} />,
    title: 'Professional Terminal',
    description: 'A beautiful, neon-inspired CLI interface with built-in pagers for long diffs and logs.'
  }
];

export const Features: React.FC = () => {
  return (
    <section id="features" className={styles.featuresSection}>
      <div className={styles.header}>
        <motion.h2 
          className={styles.title}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          Everything you need.<br/>None of the complexity.
        </motion.h2>
        <motion.p 
          className={styles.subtitle}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          GitGenie replaces your entire Git cheat sheet with a single, intelligent assistant.
        </motion.p>
      </div>

      <div className={styles.grid}>
        {features.map((feature, index) => (
          <motion.div 
            key={index}
            className={styles.card}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          >
            <div className={styles.iconWrapper}>
              {feature.icon}
            </div>
            <h3 className={styles.cardTitle}>{feature.title}</h3>
            <p className={styles.cardDescription}>{feature.description}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
