import React, { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import './Login.css';
import { FaGoogleDrive, FaPlay } from 'react-icons/fa';

const Login = () => {
    const { login } = useAuth();
    const [error, setError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const handleLogin = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            setIsLoggingIn(true);
            try {
                const userInfo = await axios.get(
                    'https://www.googleapis.com/oauth2/v3/userinfo',
                    { headers: { Authorization: `Bearer ${tokenResponse.access_token}` } }
                );
                // Pass expires_in so AuthContext can compute the expiry timestamp
                login(userInfo.data, tokenResponse.access_token, tokenResponse.expires_in);
            } catch (err) {
                console.error("Failed to fetch user info", err);
                setError('Authentication failed. Please try again.');
                setIsLoggingIn(false);
            }
        },
        onError: errorResponse => {
            console.error(errorResponse);
            setError('Google Login Failed');
            setIsLoggingIn(false);
        },
        scope: 'https://www.googleapis.com/auth/drive.readonly profile email',
    });

    return (
        <div className="login-container">
            <div className="login-overlay"></div>
            <div className="login-card glass-panel">
                <div className="login-logo">
                    <FaPlay className="logo-icon" />
                    <h1>DriveMusic</h1>
                </div>
                
                <h2 className="login-title">Your Hi-Res Library, Anywhere.</h2>
                <p className="login-subtitle">Connect your Google Drive to instantly stream your personal FLAC and WAV collection with a premium, Deezer-inspired interface.</p>
                
                {error && <div className="login-error">{error}</div>}
                
                <button 
                    className="google-btn" 
                    onClick={() => {
                        setIsLoggingIn(true);
                        handleLogin();
                    }}
                    disabled={isLoggingIn}
                >
                    <FaGoogleDrive className="google-icon" />
                    {isLoggingIn ? 'Connecting...' : 'Continue with Google Drive'}
                </button>
                
                <p className="login-disclaimer">
                    We only request read-only access to stream your audio files.
                </p>
            </div>
        </div>
    );
};

export default Login;
