import React, { createContext, useContext, useState, useEffect } from 'react';
import { googleLogout } from '@react-oauth/google';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

// Google OAuth tokens last ~1 hour. We store the expiry timestamp to validate on restore.
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before actual expiry

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Restore session from localStorage on app start
    const storedToken = localStorage.getItem('drive_access_token');
    const storedUser = localStorage.getItem('drive_user');
    const storedExpiry = localStorage.getItem('drive_token_expiry');
    
    if (storedToken && storedUser && storedExpiry) {
      const expiryTime = parseInt(storedExpiry, 10);
      const isExpired = Date.now() >= expiryTime - TOKEN_EXPIRY_BUFFER_MS;

      if (!isExpired) {
        // Token is still valid — restore session
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } else {
        // Token expired — clear stale data to force re-login
        console.warn("Stored token has expired. Clearing session.");
        localStorage.removeItem('drive_access_token');
        localStorage.removeItem('drive_user');
        localStorage.removeItem('drive_token_expiry');
      }
    }
    
    setIsLoading(false);
  }, []);

  // expiresIn is in seconds (from Google's token response — default 3600)
  const login = (userInfo, accessToken, expiresIn = 3600) => {
    const expiryTimestamp = Date.now() + expiresIn * 1000;
    setUser(userInfo);
    setToken(accessToken);
    localStorage.setItem('drive_access_token', accessToken);
    localStorage.setItem('drive_user', JSON.stringify(userInfo));
    localStorage.setItem('drive_token_expiry', String(expiryTimestamp));
  };

  const logout = () => {
    googleLogout();
    setUser(null);
    setToken(null);
    localStorage.removeItem('drive_access_token');
    localStorage.removeItem('drive_user');
    localStorage.removeItem('drive_token_expiry');
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
