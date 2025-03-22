document.getElementById('extractButton').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        console.log('Injecting content.js into tab:', tabs[0].id);
        chrome.scripting.executeScript({
            target: {tabId: tabs[0].id},
            files: ['content.js'],
        }, (results) => {
            if (chrome.runtime.lastError) {
                console.error('Injection error:', chrome.runtime.lastError.message);
            } else {
                console.log('content.js injected successfully:', results);
                window.close(); // Закрываем popup
            }
        });
    });
});