import { useState, useEffect } from 'react';
import { type } from '@tauri-apps/plugin-os';

export function usePlatform() {
  const [platformInfo, setPlatformInfo] = useState({
    isMobile: false,
    isDesktop: true,
    isAndroid: false,
  });

  useEffect(() => {
    const updatePlatform = () => {
      let isAndroid = false;
      let isMobile = false;

      try {
        const osType = type();
        isAndroid = osType === 'android';
        const isIos = osType === 'ios';
        isMobile = isAndroid || isIos;
      } catch (e) {
        const ua = navigator.userAgent.toLowerCase();
        isAndroid = ua.includes('android');
        isMobile = isAndroid || ua.includes('iphone') || ua.includes('ipad');
      }

      // Also switch to mobile dashboard preview when window width is under 768px on PC
      const isNarrowScreen = window.innerWidth < 768;

      setPlatformInfo({
        isMobile: isMobile || isNarrowScreen,
        isDesktop: !isMobile && !isNarrowScreen,
        isAndroid,
      });
    };

    updatePlatform();
    window.addEventListener('resize', updatePlatform);
    return () => window.removeEventListener('resize', updatePlatform);
  }, []);

  return platformInfo;
}
