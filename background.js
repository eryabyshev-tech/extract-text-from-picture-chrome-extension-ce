console.log('Background service worker starting...');

let offscreenReady = false;

async function createOffscreenDocument() {
  console.log('Checking for existing offscreen document...');
  if (!(await chrome.offscreen.hasDocument())) {
    console.log('Creating offscreen document...');
    try {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['WORKERS'],
        justification: 'Run Tesseract.js worker for OCR',
      });
      console.log('Offscreen document created successfully.');
    } catch (err) {
      console.error('Failed to create offscreen document:', err);
      return;
    }
  } else {
    console.log('Offscreen document already exists.');
  }
  console.log('Waiting for offscreen to report ready...');
  try {
    await Promise.race([
      new Promise((resolve) => {
        chrome.runtime.onMessage.addListener(function readyListener(message) {
          console.log('Received message in background:', message);
          if (message.type === 'offscreenReady') {
            offscreenReady = true;
            console.log('Offscreen reported ready.');
            chrome.runtime.onMessage.removeListener(readyListener);
            resolve();
          }
        });
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for offscreenReady')), 20000)), // Увеличили до 20 секунд
    ]);
    console.log('Offscreen document fully initialized.');
  } catch (err) {
    console.error('Offscreen initialization failed:', err);
    offscreenReady = false;
  }
}

createOffscreenDocument().catch((err) => console.error('Failed to create offscreen:', err));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.message === 'getTabId') {
    console.log('Received getTabId request from content.js');
    sendResponse(sender.tab.id);
    return false;
  }

  if (message.message === 'captureTab') {
    console.log('Received captureTab request from content.js:', message);
    chrome.tabs.captureVisibleTab(
      null,
      { format: 'png' },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error('Failed to capture tab:', chrome.runtime.lastError);
          sendResponse(null);
        } else {
          console.log('Tab captured successfully, data URL length:', dataUrl?.length);
          sendResponse(dataUrl);
        }
      }
    );
    return true;
  }

  if (message.type === 'extractTextFromImage') {
    console.log('Received extractTextFromImage message from content.js:', message.imageDataUrl.substring(0, 50) + '...');
    if (!offscreenReady) {
      console.log('Offscreen not ready, waiting...');
      const waitForOffscreen = async () => {
        let attempts = 0;
        while (!offscreenReady && attempts < 100) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          attempts++;
          console.log(`Waiting for offscreen, attempt ${attempts}`);
        }
        if (!offscreenReady) {
          console.error('Offscreen still not ready after waiting');
          sendResponse({ error: 'Offscreen not initialized' });
          return;
        }
        console.log('Offscreen ready, forwarding message...');
        chrome.runtime.sendMessage(message, (response) => {
          console.log('Response from offscreen:', response);
          sendResponse(response);
        });
      };
      waitForOffscreen();
    } else {
      console.log('Offscreen ready, forwarding message immediately...');
      chrome.runtime.sendMessage(message, (response) => {
        console.log('Response from offscreen:', response);
        sendResponse(response);
      });
    }
    return true;
  }
});