import { useEffect, useMemo, useState } from 'react';
import logger from './logger';

// Read the runtime config from the browser so container environment values are available after startup.
const runtimeConfig = window.__APP_CONFIG__ || {};
const API_BASE = runtimeConfig.apiTarget || 'http://localhost:3100';

console.info('[FRONTEND-STARTUP]', 'Resolved frontend config', {
  apiTarget: API_BASE,
  mode: import.meta.env.MODE,
  base: import.meta.env.BASE_URL,
  dev: import.meta.env.DEV,
  prod: import.meta.env.PROD,
  hostname: window.location.hostname,
  port: window.location.port,
  runtimeConfig
});

const parseJsonResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (!text) {
    return null;
  }

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`Invalid JSON response: ${text}`);
    }
  }

  throw new Error(`Unexpected response from API: ${text}`);
};

function App() {
  const [images, setImages] = useState([]);
  const [selectedImageId, setSelectedImageId] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadName, setUploadName] = useState('');
  const [updateFile, setUpdateFile] = useState(null);
  const [updateName, setUpdateName] = useState('');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);

  // Keep a short activity log that mirrors the browser console with timestamps.
  const appendLog = (level, component, message) => {
    const entry = level === 'INFO'
      ? logger.info(component, message)
      : level === 'WARN'
        ? logger.warn(component, message)
        : logger.error(component, message);

    setLogs((current) => [entry, ...current].slice(0, 20));
  };

  const requestJson = async (url, options = {}) => {
    const method = options.method || 'GET';
    appendLog('INFO', 'UI', `Request ${method} ${url}`);

    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type') || '';
    const bodyText = await response.text();

    appendLog('INFO', 'UI', `Response ${method} ${url} -> ${response.status} ${contentType}`);
    if (bodyText) {
      appendLog('INFO', 'UI', `Body ${method} ${url} -> ${bodyText}`);
    }

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}: ${bodyText}`);
    }

    if (!bodyText) {
      return null;
    }

    if (contentType.includes('application/json')) {
      return JSON.parse(bodyText);
    }

    throw new Error(`Unexpected response format: ${bodyText}`);
  };

  const refreshImages = async () => {
    try {
      setLoading(true);
      const data = await requestJson(`${API_BASE}/api/images`);
      const imagesData = Array.isArray(data) ? data : [];
      setImages(imagesData);
      appendLog('INFO', 'UI', `Loaded ${imagesData.length} image(s)`);

      if (!selectedImageId && imagesData[0]) {
        setSelectedImageId(imagesData[0].imageId || imagesData[0]._id);
      }
    } catch (error) {
      appendLog('ERROR', 'UI', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshImages();
  }, []);

  useEffect(() => {
    const activeImage = images.find((image) => (image.imageId || image._id) === selectedImageId);
    setSelectedImage(activeImage || null);
  }, [images, selectedImageId]);

  const selectedImageLabel = useMemo(() => {
    if (!selectedImage) {
      return 'No image selected';
    }
    return `${selectedImage.name} (${selectedImage.imageId || selectedImage._id})`;
  }, [selectedImage]);

  const handleSelectImage = async (imageId) => {
    try {
      setSelectedImageId(imageId);
      appendLog('INFO', 'UI', `Viewing image ${imageId}`);
      const data = await requestJson(`${API_BASE}/api/images/${imageId}`);
      setSelectedImage(data);
    } catch (error) {
      appendLog('ERROR', 'UI', error.message);
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!uploadFile) {
      appendLog('WARN', 'UI', 'No file selected for upload');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('image', uploadFile);
      if (uploadName) {
        formData.append('name', uploadName);
      }

      const data = await requestJson(`${API_BASE}/api/images`, {
        method: 'POST',
        body: formData
      });

      appendLog('INFO', 'UI', `Uploaded ${data?.image?.name || uploadFile.name}`);
      setUploadFile(null);
      setUploadName('');
      event.target.reset();
      await refreshImages();
      setSelectedImageId(data.image?.imageId || data.image?._id);
    } catch (error) {
      appendLog('ERROR', 'UI', error.message);
    }
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    if (!selectedImage) {
      appendLog('WARN', 'UI', 'Select an image before updating');
      return;
    }

    try {
      const formData = new FormData();
      if (updateFile) {
        formData.append('image', updateFile);
      }
      if (updateName) {
        formData.append('name', updateName);
      }

      const data = await requestJson(`${API_BASE}/api/images/${selectedImage.imageId || selectedImage._id}`, {
        method: 'PUT',
        body: formData
      });

      appendLog('INFO', 'UI', `Updated ${data?.image?.name || selectedImage.name}`);
      setUpdateFile(null);
      setUpdateName('');
      event.target.reset();
      await refreshImages();
    } catch (error) {
      appendLog('ERROR', 'UI', error.message);
    }
  };

  const handleDelete = async () => {
    if (!selectedImage) {
      return;
    }

    try {
      const data = await requestJson(`${API_BASE}/api/images/${selectedImage.imageId || selectedImage._id}`, {
        method: 'DELETE'
      });

      appendLog('INFO', 'UI', `Deleted ${selectedImage.name}`);
      await refreshImages();
      setSelectedImage(null);
    } catch (error) {
      appendLog('ERROR', 'UI', error.message);
    }
  };

  return (
    <div className="app-shell">
      <header>
        <h1>S3 Image Manager</h1>
        <p>List, preview, upload, update, and delete images through the backend API.</p>
      </header>

      <main className="grid">
        <section className="panel">
          <h2>Images</h2>
          {loading ? <p>Loading images...</p> : null}
          <ul className="image-list">
            {images.map((image) => {
              const id = image.imageId || image._id;
              return (
                <li key={id}>
                  <button type="button" className={selectedImageId === id ? 'active' : ''} onClick={() => handleSelectImage(id)}>
                    <strong>{image.name}</strong>
                    <span>{new Date(image.uploadedAt).toLocaleString()}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel">
          <h2>Selected Image</h2>
          {selectedImage ? (
            <>
              <p><strong>Name:</strong> {selectedImage.name}</p>
              <p><strong>ID:</strong> {selectedImage.imageId || selectedImage._id}</p>
              <p><strong>Size:</strong> {selectedImage.size} bytes</p>
              <img src={selectedImage.url} alt={selectedImage.name} />
              <div className="actions">
                <button type="button" onClick={handleDelete}>Delete image</button>
              </div>
            </>
          ) : (
            <p>{selectedImageLabel}</p>
          )}
        </section>
      </main>

      <section className="panel forms-panel">
        <div>
          <h2>Upload a new image</h2>
          <form onSubmit={handleUpload} className="form-stack">
            <input type="file" accept="image/*" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} />
            <input type="text" placeholder="Optional display name" value={uploadName} onChange={(event) => setUploadName(event.target.value)} />
            <button type="submit">Upload</button>
          </form>
        </div>

        <div>
          <h2>Update selected image</h2>
          <form onSubmit={handleUpdate} className="form-stack">
            <input type="file" accept="image/*" onChange={(event) => setUpdateFile(event.target.files?.[0] || null)} />
            <input type="text" placeholder="Optional new name" value={updateName} onChange={(event) => setUpdateName(event.target.value)} />
            <button type="submit">Update</button>
          </form>
        </div>
      </section>

      <section className="panel">
        <h2>Activity log</h2>
        <ul className="log-list">
          {logs.map((entry, index) => (
            <li key={`${entry}-${index}`}>{entry}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default App;
