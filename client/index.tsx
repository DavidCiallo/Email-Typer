import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './components/theme-provider';
import { Toaster } from './components/ui/sonner';

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <ThemeProvider>
      <App />
      <Toaster />
    </ThemeProvider>
  );
}
