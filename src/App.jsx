import React from 'react';
import './App.css';
import BrandAnimation from './BrandAnimation';
import LoginForm from './LoginForm';

function App({ onLogin }) {
  return (
    <div className="login-container">
      <div className="login-left">
        <BrandAnimation />
      </div>
      <div className="login-right">
        <LoginForm onLogin={onLogin} />
      </div>
    </div>
  );
}

export default App;
