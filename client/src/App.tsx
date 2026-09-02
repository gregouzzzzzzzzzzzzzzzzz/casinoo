import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { HostScreen } from './pages/HostScreen';
import { PhoneScreen } from './pages/PhoneScreen';

export const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        {/* Route /host : Main central host board */}
        <Route path="/host" element={<HostScreen />} />

        {/* Route / : Mobile player controller */}
        <Route path="/" element={<PhoneScreen />} />

        {/* Fallback to phone screen */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default App;
