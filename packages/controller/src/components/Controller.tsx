import React, { useRef, useCallback, useEffect, useState } from 'react';
import type { Ship } from '@game-zero/shared';

interface ControllerProps {
  ship: Ship | null;
  onInput: (rotation: number, thrust: boolean, fire: boolean) => void;
}

export function Controller({ ship, onInput }: ControllerProps) {
  const [tiltValue, setTiltValue] = useState(0);
  const [thrustPressed, setThrustPressed] = useState(false);
  const [firePressed, setFirePressed] = useState(false);
  const [tiltStatus, setTiltStatus] = useState<'checking' | 'enabled' | 'unavailable'>('checking');

  const inputRef = useRef({ rotation: 0, thrust: false, fire: false });

  // Lock to landscape mode on mount
  useEffect(() => {
    const lockLandscape = async () => {
      try {
        // Try to lock screen orientation to landscape
        if (screen.orientation && (screen.orientation as any).lock) {
          await (screen.orientation as any).lock('landscape');
          console.log('Screen locked to landscape');
        }
      } catch (e) {
        // Orientation lock not supported or failed - that's OK
        console.log('Orientation lock not available:', e);
      }
    };
    lockLandscape();

    // Unlock when unmounting
    return () => {
      if (screen.orientation && (screen.orientation as any).unlock) {
        (screen.orientation as any).unlock();
      }
    };
  }, []);

  // Check tilt availability on mount
  useEffect(() => {
    try {
      // iOS 13+ requires user-gesture-triggered permission - show button
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        setTiltStatus('unavailable'); // Will show "tap to enable" button
      } else if (typeof DeviceOrientationEvent !== 'undefined') {
        // Non-iOS - just try to use it directly
        setTiltStatus('enabled');
      } else {
        setTiltStatus('unavailable');
      }
    } catch (e) {
      console.error('Tilt detection error:', e);
      setTiltStatus('unavailable');
    }
  }, []);

  // Listen to device orientation (steering only - thrust via button)
  useEffect(() => {
    if (tiltStatus !== 'enabled') return;

    const handleOrientation = (event: DeviceOrientationEvent) => {
      // In landscape mode, beta = left-right tilt (steering)
      const orientation = screen.orientation?.angle || (window.orientation as number) || 0;
      const isLandscape = Math.abs(orientation) === 90 || Math.abs(orientation) === 270;

      let steerTilt: number;
      if (isLandscape) {
        // Landscape: beta controls left-right tilt (steering)
        const beta = event.beta || 0;
        steerTilt = orientation === 90 || orientation === -270 ? beta : -beta;
      } else {
        // Portrait: gamma controls left-right tilt (inverted)
        steerTilt = -(event.gamma || 0);
      }

      // Dead zone around neutral position (ignore small tilts)
      const deadZone = 5; // degrees
      const maxTilt = 25; // degrees

      let normalizedSteer: number;
      if (Math.abs(steerTilt) < deadZone) {
        normalizedSteer = 0; // In dead zone - no steering
      } else {
        // Scale the remaining range (deadZone to maxTilt) to 0-1
        const adjustedTilt = (Math.abs(steerTilt) - deadZone) / (maxTilt - deadZone);
        normalizedSteer = Math.sign(steerTilt) * Math.min(1, adjustedTilt);
      }

      inputRef.current.rotation = normalizedSteer;
      setTiltValue(normalizedSteer);
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [tiltStatus]);

  // Send input at 30Hz
  useEffect(() => {
    const interval = setInterval(() => {
      onInput(inputRef.current.rotation, inputRef.current.thrust, inputRef.current.fire);
    }, 33);
    return () => clearInterval(interval);
  }, [onInput]);

  // Touch handlers
  const handleThrustStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    inputRef.current.thrust = true;
    setThrustPressed(true);
    if (navigator.vibrate) navigator.vibrate(10);
  }, []);

  const handleThrustEnd = useCallback(() => {
    inputRef.current.thrust = false;
    setThrustPressed(false);
  }, []);

  const handleFireStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    inputRef.current.fire = true;
    setFirePressed(true);
    if (navigator.vibrate) navigator.vibrate(15);
  }, []);

  const handleFireEnd = useCallback(() => {
    inputRef.current.fire = false;
    setFirePressed(false);
  }, []);

  // Retry tilt permission (for iOS)
  const retryTilt = useCallback(async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        if (permission === 'granted') {
          setTiltStatus('enabled');
        }
      } catch (e) {
        console.log('Tilt permission failed:', e);
      }
    }
  }, []);

  // Dead screen
  if (ship && !ship.isAlive && ship.respawnTimer > 0) {
    return (
      <div style={containerStyle}>
        <div style={deadStyle}>
          <h1 style={{ color: '#FF6B6B', fontSize: '2rem' }}>DESTROYED</h1>
          <p style={{ color: '#888', marginTop: '1rem' }}>
            Respawning in {Math.ceil(ship.respawnTimer)}...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Ship color indicator */}
      {ship && (
        <div style={{ ...colorBarStyle, backgroundColor: ship.color }} />
      )}

      {/* Header */}
      <h2 style={{ color: '#4ECDC4', fontSize: '1.2rem', marginBottom: '1rem', opacity: 0.7 }}>
        {ship?.name || 'CONTROLLER'}
      </h2>

      {/* Score display */}
      {ship && (
        <div style={scoreStyle}>
          {ship.score}
        </div>
      )}

      {/* Tilt indicator */}
      <div style={tiltIndicatorStyle}>
        <div
          style={{
            ...tiltMarkerStyle,
            transform: `translateX(${tiltValue * 40}px)`,
            backgroundColor: tiltStatus === 'enabled' ? '#4ECDC4' : '#666',
          }}
        />
        <div style={tiltCenterStyle} />
      </div>

      {/* Tilt status / enable button */}
      {tiltStatus === 'unavailable' && (
        <button onClick={retryTilt} style={tiltButtonStyle}>
          👆 TAP TO ENABLE TILT
        </button>
      )}
      {tiltStatus === 'checking' && (
        <p style={{ color: '#888', fontSize: '0.8rem' }}>Checking tilt...</p>
      )}

      {/* Button container */}
      <div style={buttonContainerStyle}>
        {/* THRUST button */}
        <button
          style={{
            ...actionButtonStyle,
            backgroundColor: thrustPressed ? '#4ECDC4' : '#1a3a38',
            borderColor: '#4ECDC4',
            transform: thrustPressed ? 'scale(0.95)' : 'scale(1)',
          }}
          onTouchStart={handleThrustStart}
          onTouchEnd={handleThrustEnd}
          onTouchCancel={handleThrustEnd}
          onMouseDown={handleThrustStart}
          onMouseUp={handleThrustEnd}
          onMouseLeave={handleThrustEnd}
        >
          <span style={buttonIconStyle}>🚀</span>
          <span style={buttonTextStyle}>THRUST</span>
        </button>

        {/* FIRE button */}
        <button
          style={{
            ...actionButtonStyle,
            backgroundColor: firePressed ? '#FF6B6B' : '#3a1a1a',
            borderColor: '#FF6B6B',
            transform: firePressed ? 'scale(0.95)' : 'scale(1)',
          }}
          onTouchStart={handleFireStart}
          onTouchEnd={handleFireEnd}
          onTouchCancel={handleFireEnd}
          onMouseDown={handleFireStart}
          onMouseUp={handleFireEnd}
          onMouseLeave={handleFireEnd}
        >
          <span style={buttonIconStyle}>🔥</span>
          <span style={buttonTextStyle}>FIRE</span>
        </button>
      </div>

      {/* Instructions */}
      <div style={instructionsStyle}>
        {tiltStatus === 'enabled' ? 'TILT TO STEER' : 'TILT UNAVAILABLE'}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  width: '100vw',
  height: '100vh',
  minHeight: '-webkit-fill-available', // iOS Safari fix
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#0a0a12',
  position: 'fixed',
  top: 0,
  left: 0,
  overflow: 'hidden',
};

const colorBarStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 4,
};

const scoreStyle: React.CSSProperties = {
  position: 'absolute',
  top: 20,
  right: 20,
  color: '#FFE66D',
  fontSize: '2rem',
  fontWeight: 'bold',
  fontFamily: 'monospace',
};

const tiltIndicatorStyle: React.CSSProperties = {
  width: 120,
  height: 8,
  backgroundColor: '#1a1a2e',
  borderRadius: 4,
  position: 'relative',
  marginBottom: 20,
};

const tiltMarkerStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  position: 'absolute',
  top: -8,
  left: '50%',
  marginLeft: -12,
  transition: 'transform 0.05s ease-out',
  boxShadow: '0 0 15px rgba(78, 205, 196, 0.5)',
};

const tiltCenterStyle: React.CSSProperties = {
  width: 2,
  height: 16,
  backgroundColor: '#333',
  position: 'absolute',
  left: '50%',
  top: -4,
  marginLeft: -1,
};

const tiltButtonStyle: React.CSSProperties = {
  padding: '0.75rem 1.5rem',
  fontSize: '1rem',
  fontFamily: 'monospace',
  backgroundColor: '#4ECDC4',
  color: '#0a0a12',
  border: 'none',
  borderRadius: '8px',
  marginBottom: 20,
  cursor: 'pointer',
  fontWeight: 'bold',
};

const buttonContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '40px',
  width: '100%',
  justifyContent: 'center',
  padding: '0 20px',
};

const actionButtonStyle: React.CSSProperties = {
  width: '140px',
  height: '140px',
  borderRadius: '50%',
  border: '4px solid',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'background-color 0.1s, transform 0.1s',
  WebkitTapHighlightColor: 'transparent',
  touchAction: 'manipulation',
  boxShadow: '0 0 20px rgba(0,0,0,0.5)',
};

const buttonIconStyle: React.CSSProperties = {
  fontSize: '2.5rem',
  marginBottom: '4px',
};

const buttonTextStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: 'bold',
  color: 'white',
  fontFamily: 'monospace',
  letterSpacing: '0.1em',
};

const instructionsStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 30,
  color: '#444',
  fontSize: '0.7rem',
  letterSpacing: '0.1em',
  textAlign: 'center',
  padding: '0 20px',
};

const deadStyle: React.CSSProperties = {
  textAlign: 'center',
};
