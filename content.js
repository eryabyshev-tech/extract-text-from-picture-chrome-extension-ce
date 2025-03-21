(function (window) {

  console.log('Starting content script execution...');

  const style = document.createElement("style");
  style.textContent = `
    .result-content {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 300px;
        background: white;
        padding: 16px;
        border-radius: 8px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        gap: 10px;
        z-index: 100000;
    }

    .result-content textarea {
        width: 100%;
        min-height: 100px;
        padding: 10px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 14px;
        resize: none;
    }

    .result-content button {
        background-color: #26a69a !important;
        color: white !important;
        border: none !important;
        padding: 10px !important;
        border-radius: 4px !important;
        cursor: pointer !important;
        transition: background 0.3s !important;
    }

    .result-content button:hover {
        background-color: #2bbbad !important;
    }
  `;

  document.addEventListener("DOMContentLoaded", () => {
      document.head.appendChild(style);
  });


  try {
    if (window.etfiCapture) {
      window.etfiCapture.remove();
    }
    if (window.etfiGuides) {
      window.etfiGuides.remove();
    }
  } catch (e) {
    console.error('Error removing previous instances:', e);
  }

  const styles = `
    .etfi-capture-box {
      position: absolute;
      border: 2px dashed #f00;
      background-color: rgba(255, 0, 0, 0.1);
      pointer-events: none;
      z-index: 9999;
    }
    .etfi-capture-guide-1 {
      position: fixed;
      top: 0;
      left: 0;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.3);
      z-index: 9998;
    }
    .etfi-capture-guide-2 {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      background-color: rgba(0, 0, 0, 0.3);
      z-index: 9998;
    }
    .etfi-capture-guide-3 {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.3);
      z-index: 9997;
    }
  `;
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
  console.log('Capture styles added.');

  async function onCapture(box) {
    console.log('Captured area:', box);
    const imageDataUrl = await captureArea(box);
    if (!imageDataUrl) {
      console.error('Failed to capture area.');
      return;
    }
    sendToTesseract(imageDataUrl);
  }

  window.etfiCapture = (function () {
    const rect = {};
    let box;

    const calc = () => ({
      left: Math.min(rect.lt.x, rect.rb.x + 1),
      top: Math.min(rect.lt.y, rect.rb.y + 1),
      width: Math.abs(rect.rb.x - rect.lt.x - 3),
      height: Math.abs(rect.rb.y - rect.lt.y - 3),
    });

    function update(e) {
      rect.rb.x = e.clientX;
      rect.rb.y = e.clientY;
      for (const [key, value] of Object.entries(calc())) {
        box.style[key] = value + 'px';
      }
    }

    function remove() {
      const area = calc();
      document.removeEventListener('mousemove', update);
      document.removeEventListener('mouseup', remove);
      if (box && document.documentElement.contains(box)) {
        document.documentElement.removeChild(box);
        console.log('Capture box removed.');
      }
      window.etfiGuides.remove();
      if (area.width > 0 && area.height > 0) {
        onCapture(area);
      } else {
        console.log('Area too small, skipping.');
      }
    }

    function mousedown(e) {
      e.stopPropagation();
      e.preventDefault();
      console.log('Mouse down at:', { x: e.clientX, y: e.clientY });
      box = document.createElement('div');
      box.setAttribute('class', 'etfi-capture-box');
      rect.lt = { x: e.clientX, y: e.clientY };
      rect.rb = { x: e.clientX, y: e.clientY };
      document.documentElement.appendChild(box);
      document.addEventListener('mousemove', update);
      document.addEventListener('mouseup', remove);
    }

    function keydown(e) {
      if (e.code === 'Escape') {
        window.etfiGuides.remove();
        window.etfiCapture.remove();
        chrome.runtime.sendMessage({ message: 'aborted' });
        console.log('Capture aborted by Escape.');
      }
    }

    return {
      install: function () {
        document.addEventListener('mousedown', mousedown);
        window.addEventListener('keydown', keydown);
        console.log('Capture installed.');
      },
      remove: function () {
        document.removeEventListener('mousedown', mousedown);
        document.removeEventListener('mousemove', update);
        document.removeEventListener('mouseup', remove);
        if (box && document.documentElement.contains(box)) {
          document.documentElement.removeChild(box);
          console.log('Capture box removed on cleanup.');
        }
        window.removeEventListener('keydown', keydown);
        console.log('Capture fully removed.');
      },
    };
  })();

  window.etfiGuides = (function () {
    let guide1, guide2, guide3;

    function position(left, top) {
      guide1.style.width = left + 'px';
      guide2.style.height = top + 'px';
    }

    function update(e) {
      position(e.clientX, e.clientY);
    }

    return {
      install() {
        guide1 = document.createElement('div');
        guide2 = document.createElement('div');
        guide3 = document.createElement('div');
        guide1.setAttribute('class', 'etfi-capture-guide-1');
        guide2.setAttribute('class', 'etfi-capture-guide-2');
        guide3.setAttribute('class', 'etfi-capture-guide-3');
        document.documentElement.append(guide1, guide2, guide3);
        document.addEventListener('mousemove', update, false);
        console.log('Guides installed.');
      },
      remove() {
        document.removeEventListener('mousemove', update, false);
        for (const e of [...document.querySelectorAll('.etfi-capture-guide-1, .etfi-capture-guide-2, .etfi-capture-guide-3')]) {
          e.remove();
        }
        console.log('Guides removed.');
      },
    };
  })();

  async function captureArea(box) {
    console.log('Capturing area to canvas:', box);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = box.width * dpr;
    canvas.height = box.height * dpr;
    ctx.scale(dpr, dpr);

    const centerX = box.left + box.width / 2;
    const centerY = box.top + box.height / 2;
    let img = document.elementFromPoint(centerX, centerY);
    if (!img || img.tagName !== 'IMG') {
      img = img?.closest('img');
    }

    if (img) {
      console.log('Found image:', img.src);
      try {
        const tempImg = new Image();
        tempImg.crossOrigin = 'anonymous';
        tempImg.src = img.src;
        await new Promise((resolve, reject) => {
          tempImg.onload = resolve;
          tempImg.onerror = reject;
        });
        const imgRect = img.getBoundingClientRect();
        const sx = (box.left - imgRect.left) * dpr;
        const sy = (box.top - imgRect.top) * dpr;
        const sWidth = box.width * dpr;
        const sHeight = box.height * dpr;
        ctx.drawImage(tempImg, sx, sy, sWidth, sHeight, 0, 0, box.width, box.height);
      } catch (e) {
        console.error('Failed to draw image:', e);
        return null;
      }
    } else {
      console.warn('No image found in selected area, capturing as screenshot.');
      try {
        const tabId = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ message: 'getTabId' }, (response) => {
            console.log('Received tabId:', response);
            resolve(response);
          });
        });
        if (!tabId) throw new Error('No tabId received');

        const dataUrl = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { message: 'captureTab', tabId, area: { ...box, devicePixelRatio: dpr } },
            (response) => {
              if (chrome.runtime.lastError) {
                console.error('sendMessage error:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
              } else if (!response) {
                console.error('No response from captureTab');
                reject(new Error('No response from captureTab'));
              } else {
                console.log('Received dataUrl length:', response.length);
                resolve(response);
              }
            }
          );
        });
        const tempImg = new Image();
        tempImg.src = dataUrl;
        await new Promise((resolve, reject) => {
          tempImg.onload = resolve;
          tempImg.onerror = reject;
        });
        ctx.drawImage(tempImg, box.left * dpr, box.top * dpr, box.width * dpr, box.height * dpr, 0, 0, box.width, box.height);
      } catch (e) {
        console.error('Failed to capture tab:', e);
        return null;
      }
    }

    canvas.style.position = 'fixed';
    canvas.style.top = '10px';
    canvas.style.left = '10px';
    canvas.style.border = '1px solid red';
    canvas.style.width = box.width + 'px';
    canvas.style.height = box.height + 'px';
    document.body.appendChild(canvas);
    setTimeout(() => {
      if (canvas.parentNode) document.body.removeChild(canvas);
    }, 1500);

    try {
      const imageDataUrl = canvas.toDataURL('image/png');
      console.log('Generated image data URL:', imageDataUrl);
      return imageDataUrl;
    } catch (e) {
      console.error('toDataURL failed:', e);
      return null;
    }
  }

  function sendToTesseract(imageDataUrl) {
    const sendMessageWithRetry = (retries = 10, delay = 1000) => {
      chrome.runtime.sendMessage(
        { type: 'extractTextFromImage', imageDataUrl },
        (response) => {
          if (chrome.runtime.lastError || !response) {
            if (retries > 0) {
              console.log(`No response, retrying (${retries} attempts left)...`);
              setTimeout(() => sendMessageWithRetry(retries - 1, delay), delay);
            } else {
              console.error('Failed to get response after retries:', chrome.runtime.lastError?.message);
              showError()
            }
          } else if (response.error) {
                showError()
          } else {
            console.log('Text extracted:', response.text);
            showResult(response.text);
          }
        }
      );
    };
    sendMessageWithRetry();
  }

  function showResult(text) {
    console.log('Showing result:', text);
    const resultBox = document.createElement('div');
    resultBox.style.position = 'fixed';
    resultBox.style.bottom = '20px';
    resultBox.style.right = '20px';
    resultBox.style.padding = '10px';
    resultBox.style.backgroundColor = '#fff';
    resultBox.style.border = '1px solid #ccc';
    resultBox.style.zIndex = '10000';
    resultBox.innerHTML = `
     <div style="position: fixed;  bottom: 20px; right: 20px">
          <div style="bottom: 20px; right: 20px; width: 300px; background: white; padding: 16px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2); display: flex; flex-direction: column; gap: 10px; z-index: 1000;">
            <h5 style="margin: 0; font-size: 18px; color: #333;">Extracted Text</h5>
            <textarea style="height: 300px; width: 100%; min-height: 100px; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; resize: none;">${text}</textarea>
          </div>
          <div style="display: flex; gap: 10px; justify-content: space-between; padding-top: 10px;">
            <a href="#!" id="copyTextBtn" style="background-color: #26a69a; color: white; padding: 10px; border-radius: 4px; cursor: pointer; transition: background 0.3s; text-decoration: none; display: inline-block;">Copy</a>
            <a href="#!" id="closeResultBtn" style="background-color: #e53935; color: white; padding: 10px; border-radius: 4px; cursor: pointer; transition: background 0.3s; text-decoration: none; display: inline-block;">Close</a>
          </div>
     <div>
    `;
    document.body.appendChild(resultBox);

    document.getElementById('copyTextBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(text);
      console.log('Text copied to clipboard:', text);
    });

    document.getElementById('closeResultBtn').addEventListener('click', () => {
      document.body.removeChild(resultBox);
      console.log('Result box closed.');
    });

    window.etfiGuides.remove();
    window.etfiCapture.remove();
    chrome.runtime.sendMessage({ message: 'aborted' });
    console.log('Process of ocr finished.');
  }

  function showError() {
      const resultBox = document.createElement('div');
      resultBox.style.position = 'fixed';
      resultBox.style.bottom = '20px';
      resultBox.style.right = '20px';
      resultBox.style.padding = '10px';
      resultBox.style.backgroundColor = '#fff';
      resultBox.style.border = '1px solid #ccc';
      resultBox.style.zIndex = '10000';
      resultBox.innerHTML = `
            <div style="width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center; align-items: center; z-index: 1000;">
              <div style="background: #fff; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); max-width: 400px; width: 100%; transition: transform 0.3s ease;">
                <h5 style="color: #d32f2f; font-size: 18px;">Sorry, we couldn't recognize the text.</h5>
                <p style="font-size: 16px; color: #555;">Please try again later or contact support.</p>
                <button id="closeErrorBtn" style="background-color: #d32f2f; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 16px; transition: background-color 0.3s ease;">Close</button>
              </div>
            </div>
      `;
      document.body.appendChild(resultBox);


      document.getElementById('closeErrorBtn').addEventListener('click', () => {
        document.body.removeChild(resultBox);
        console.log('Error box closed.');
      });

      window.etfiGuides.remove();
      window.etfiCapture.remove();
      chrome.runtime.sendMessage({ message: 'aborted' });
      console.log('Error of ocr finished.');
    }


  window.etfiGuides.install();
  window.etfiCapture.install();
})(window);