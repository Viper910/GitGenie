import { theme, isNoColor } from '../terminal/theme.js';
import { APP_VERSION, APP_TAGLINE } from '../config/constants.js';

export function renderBanner(minimal = false): void {
  if (minimal || isNoColor()) {
    console.log(`${theme.cyanBold('⚡ GITGENIE')} ${theme.gray(`v${APP_VERSION}`)} - ${theme.purple(APP_TAGLINE)}\n`);
    return;
  }

  const logo = `
  ██████╗ ██╗████████╗ ██████╗ ███████╗███╗   ██╗██╗███████╗
 ██╔════╝ ██║╚══██╔══╝██╔════╝ ██╔════╝████╗  ██║██║██╔════╝
 ██║  ███╗██║   ██║   ██║  ███╗█████╗  ██╔██╗ ██║██║█████╗  
 ██║   ██║██║   ██║   ██║   ██║██╔══╝  ██║╚██╗██║██║██╔══╝  
 ╚██████╔╝██║   ██║   ╚██████╔╝███████╗██║ ╚████║██║███████╗
  ╚═════╝ ╚═╝   ╚═╝    ╚═════╝ ╚══════╝╚═╝  ╚═══╝╚═╝╚══════╝
`;

  console.log(theme.cyan(logo));
  console.log(`  ${theme.purpleBold('⚡ AI-POWERED GIT AUTOMATION TERMINAL')} ${theme.dim(`v${APP_VERSION}`)}`);
  console.log(`  ${theme.dim('Safe Execution • Zero Shell Injection • OpenRouter AI Gateway')}\n`);
}
