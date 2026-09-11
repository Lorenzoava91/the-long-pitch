const uploadSelector = '.nc-fileUploadButton input[type="file"]';
const isHeic = file => /\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf](?:-sequence)?$/i.test(file.type);

/**
 * Decap 3.16.2 has no pre-upload transform hook. Intercept its file input
 * before React receives the event, then replay it with a real JPEG File.
 * Decap still owns filenames, overwrite confirmation, drafts and persistence.
 * Keep the CMS version pinned and retest this adapter when upgrading it.
 */
export function enableHeicUploads() {
  let busy = false;
  const addFormats = input => {
    if (input.matches(uploadSelector) && !input.accept.includes('.heic')) {
      input.accept = [input.accept, '.heic', '.heif', 'image/heic', 'image/heif'].filter(Boolean).join(',');
    }
  };
  new MutationObserver(() => {
    document.querySelectorAll(uploadSelector).forEach(addFormats);
  }).observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll(uploadSelector).forEach(addFormats);

  // Updating just before the picker opens also handles newly rendered inputs.
  document.addEventListener('click', event => {
    if (event.target instanceof HTMLInputElement) addFormats(event.target);
  }, true);

  document.addEventListener('change', async event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches(uploadSelector)) return;
    const file = input.files?.[0]; // Decap's picker accepts one file at a time.
    if (!file || !isHeic(file)) return;
    event.stopImmediatePropagation();
    if (busy) return;
    busy = true;

    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-labelledby', 'heic-upload-title');
    dialog.style.cssText = 'max-width:420px;width:calc(100% - 48px);box-sizing:border-box;padding:28px;border:1px solid #d9dfe5;border-radius:8px;font:16px/1.5 system-ui;color:#263238;background:white;';
    dialog.innerHTML = '<h2 id="heic-upload-title" style="margin:0 0 12px;font-size:20px">Preparing your photo</h2><p role="status" aria-live="polite"></p><p>Your original file stays on your computer.</p><button type="button" style="padding:10px 20px;font:inherit;cursor:pointer">Cancel</button>';
    const status = dialog.querySelector('[role="status"]');
    status.textContent = `Converting ${file.name} to JPEG…`;
    document.body.append(dialog);
    dialog.showModal();

    const beforeUnload = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    let worker;
    let timeout;
    let cancelled = false;
    let jpeg;
    try {
      const blob = await new Promise((resolve, reject) => {
        const cancel = event => {
          event.preventDefault();
          cancelled = true;
          reject(new Error('Cancelled'));
        };
        dialog.addEventListener('cancel', cancel);
        dialog.querySelector('button').onclick = cancel;
        worker = new Worker(new URL('./heic-worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data.blob);
        worker.onerror = () => reject(new Error('The photo converter could not be loaded.'));
        timeout = setTimeout(() => reject(new Error('Conversion took too long.')), 120000);
        worker.postMessage(file);
      });
      if (!(blob instanceof Blob) || blob.type !== 'image/jpeg' || !blob.size) {
        throw new Error('No JPEG was produced.');
      }
      const stem = file.name.replace(/\.[^.]+$/, '') || 'photo';
      jpeg = new File([blob], `${stem}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
    } catch (error) {
      if (!cancelled) {
        console.error('HEIC conversion failed:', error);
        window.alert(`Could not convert "${file.name}". Nothing has been uploaded. Try again, or export this photo as JPEG and upload that copy.`);
      }
    } finally {
      clearTimeout(timeout);
      worker?.terminate();
      window.removeEventListener('beforeunload', beforeUnload);
      dialog.close();
      dialog.remove();
      input.value = ''; // Allow retrying the same file after cancellation/failure.
      busy = false;
    }

    if (jpeg && input.isConnected) {
      const transfer = new DataTransfer();
      transfer.items.add(jpeg);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, true);
}
