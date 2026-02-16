let d3Promise;

export async function loadD3() {
  if (globalThis.d3) return globalThis.d3;

  if (!d3Promise) {
    d3Promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('./d3.v7.9.0.min.js', import.meta.url).href;
      script.async = true;
      script.onload = () => {
        if (globalThis.d3) {
          resolve(globalThis.d3);
          return;
        }
        reject(new Error('Local d3 bundle loaded but globalThis.d3 was not initialized'));
      };
      script.onerror = () => reject(new Error('Failed to load local d3 bundle'));
      document.head.appendChild(script);
    });
  }

  return d3Promise;
}
