import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { UpdateProvider } from './context/UpdateContext';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import ChangePasswordModal from './components/ChangePasswordModal';
import FirstLoginPhotoModal from './components/FirstLoginPhotoModal';
import UpdatePromptModal from './components/UpdatePromptModal';

function AppContent() {
  const { user, mustChangePassword, isFirstLogin } = useAuth();

  if (!user) {
    return (
      <>
        <LoginPage />
        <UpdatePromptModal />
      </>
    );
  }

  return (
    <>
      <HomePage />
      <ChangePasswordModal isOpen={mustChangePassword} />
      <FirstLoginPhotoModal isOpen={!mustChangePassword && isFirstLogin} />
      <UpdatePromptModal />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <UpdateProvider>
          <AppContent />
        </UpdateProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
