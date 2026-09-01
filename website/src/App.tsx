
import { Navbar } from './components/Navbar/Navbar';
import { Hero } from './components/Hero/Hero';
import { Features } from './components/Features/Features';
import { HowItWorks } from './components/HowItWorks/HowItWorks';
import { Security } from './components/Security/Security';
import { Documentation } from './components/Documentation/Documentation';
import { Playground } from './components/Playground/Playground';
import { CTA } from './components/CTA/CTA';
import { Footer } from './components/Footer/Footer';

function App() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Security />
        <Playground />
        <Documentation />
        <CTA />
      </main>
      <Footer />
    </>
  );
}

export default App;
