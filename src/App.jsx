import { useEffect, useMemo, useState } from 'react';
import logger from './logger';

const runtimeConfig = window.__APP_CONFIG__ || {};
const API_BASE = runtimeConfig.apiTarget || import.meta.env.VITE_API_TARGET || 'http://localhost:3100';
const MAX_IMAGE_SIZE_BYTES = Number(runtimeConfig.maxImageSizeBytes || import.meta.env.VITE_MAX_IMAGE_SIZE_BYTES || 5 * 1024 * 1024);

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

const pages = {
  home: '/',
  login: '/login',
  health: '/health',
  deleteAll: '/delete-all'
};

const getCurrentPage = () => {
  const path = window.location.pathname;

  if (path === pages.login) {
    return 'login';
  }

  if (path === pages.health) {
    return 'health';
  }

  if (path === pages.deleteAll) {
    return 'deleteAll';
  }

  return 'home';
};

const formatFileSize = (sizeInBytes) => {
  if (!Number.isFinite(sizeInBytes) || sizeInBytes <= 0) {
    return '0 KB';
  }

  if (sizeInBytes >= 1024 * 1024) {
    return `${Math.ceil(sizeInBytes / (1024 * 1024))} MB`;
  }

  return `${Math.ceil(sizeInBytes / 1024)} KB`;
};

const getMessageFromErrorBody = (bodyText, fallback) => {
  if (!bodyText) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(bodyText);
    return parsed.message || parsed.error || fallback;
  } catch {
    return bodyText;
  }
};

const getImageId = (image) => image?.imageId || image?._id || '';

const getImageFileName = (image) => image?.fileName || image?.key || image?.name || 'Unnamed file';

const getImageDisplayName = (image) => image?.name || getImageFileName(image);

const getImageRenderUrl = (image) => image?.url || '';

const formatDateTime = (value) => {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }

  return date.toLocaleString();
};

const summarizeResponseBody = (data) => {
  if (Array.isArray(data)) {
    const names = data.map((image) => getImageFileName(image)).filter(Boolean);
    return `Received ${data.length} image metadata record(s)${names.length ? `: ${names.join(', ')}` : ''}`;
  }

  if (data?.image) {
    return `${data.message || 'Image response'} (${getImageFileName(data.image)})`;
  }

  if (data?.fileName || data?.key || data?.imageId || data?._id) {
    return `Received image metadata for ${getImageFileName(data)}`;
  }

  if (data?.message) {
    return data.message;
  }

  if (data?.status) {
    return `Status: ${data.status}`;
  }

  return 'Received JSON response';
};

const AuthNotice = ({ token, children }) => {
  if (token) {
    return null;
  }

  return (
    <div className="notice error-notice" role="alert">
      <strong>Login required</strong>
      <span>{children}</span>
    </div>
  );
};

function App() {
  const [page, setPage] = useState(getCurrentPage);
  const [images, setImages] = useState([]);
  const [selectedImageId, setSelectedImageId] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [updateFile, setUpdateFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authToken, setAuthToken] = useState(localStorage.getItem('authToken') || '');
  const [loginStatus, setLoginStatus] = useState(authToken ? 'Authenticated' : 'Enter your admin credentials to continue.');
  const [healthResult, setHealthResult] = useState(null);
  const [healthStatus, setHealthStatus] = useState('');
  const [deleteAllStatus, setDeleteAllStatus] = useState('');

  useEffect(() => {
    const handlePopState = () => setPage(getCurrentPage());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const appendLog = (level, component, message) => {
    const entry = level === 'INFO'
      ? logger.info(component, message)
      : level === 'WARN'
        ? logger.warn(component, message)
        : logger.error(component, message);

    setLogs((current) => [entry, ...current].slice(0, 20));
  };

  const navigate = (nextPage) => {
    window.history.pushState({}, '', pages[nextPage]);
    setPage(nextPage);
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setAuthToken('');
    setLoginStatus('Signed out. Log in again to use protected routes.');
    setHealthResult(null);
    setHealthStatus('');
    setDeleteAllStatus('');
    appendLog('INFO', 'AUTH', 'Logged out');
  };

  const requestJson = async (url, options = {}) => {
    const method = options.method || 'GET';
    appendLog('INFO', 'UI', `Request ${method} ${url}`);

    const headers = new Headers(options.headers || {});
    if (authToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }

    const response = await fetch(url, { ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const bodyText = await response.text();

    appendLog('INFO', 'UI', `Response ${method} ${url} -> ${response.status} ${contentType}`);

    if (!response.ok) {
      const message = getMessageFromErrorBody(bodyText, `Request failed with status ${response.status}`);
      throw new Error(message);
    }

    if (!bodyText) {
      return null;
    }

    if (!contentType.includes('application/json')) {
      throw new Error(`Unexpected response format: ${bodyText}`);
    }

    const data = JSON.parse(bodyText);
    appendLog('INFO', 'UI', summarizeResponseBody(data));
    return data;
  };

  const refreshImages = async () => {
    try {
      setLoading(true);
      const data = await requestJson(`${API_BASE}/api/images`);
      const imagesData = Array.isArray(data) ? data : [];
      setImages(imagesData);
      appendLog('INFO', 'UI', `Loaded ${imagesData.length} image(s)`);

      if (!selectedImageId && imagesData[0]) {
        setSelectedImageId(getImageId(imagesData[0]));
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
    const activeImage = images.find((image) => getImageId(image) === selectedImageId);
    setSelectedImage(activeImage || null);
  }, [images, selectedImageId]);

  const selectedImageLabel = useMemo(() => {
    if (!selectedImage) {
      return 'No image selected';
    }
    return `${getImageDisplayName(selectedImage)} (${getImageId(selectedImage)})`;
  }, [selectedImage]);

  const handleSelectImage = async (imageId) => {
    try {
      setSelectedImageId(imageId);
      appendLog('INFO', 'UI', `Viewing image ${imageId}`);
      const data = await requestJson(`${API_BASE}/api/images/${imageId}`);
      setSelectedImage(data);
      appendLog('INFO', 'UI', `Rendering ${getImageFileName(data)} from ${getImageRenderUrl(data) || 'no CloudFront URL configured'}`);
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

    if (uploadFile.size > MAX_IMAGE_SIZE_BYTES) {
      appendLog('WARN', 'UI', `Image is too large. Maximum allowed size is ${formatFileSize(MAX_IMAGE_SIZE_BYTES)}.`);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('image', uploadFile);

      const data = await requestJson(`${API_BASE}/api/images`, {
        method: 'POST',
        body: formData
      });

      appendLog('INFO', 'UI', `Uploaded ${getImageFileName(data?.image) || uploadFile.name}`);
      setUploadFile(null);
      event.target.reset();
      await refreshImages();
      setSelectedImageId(getImageId(data.image));
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

    if (updateFile && updateFile.size > MAX_IMAGE_SIZE_BYTES) {
      appendLog('WARN', 'UI', `Image is too large. Maximum allowed size is ${formatFileSize(MAX_IMAGE_SIZE_BYTES)}.`);
      return;
    }

    try {
      const formData = new FormData();
      if (updateFile) {
        formData.append('image', updateFile);
      }

      const data = await requestJson(`${API_BASE}/api/images/${selectedImage.imageId || selectedImage._id}`, {
        method: 'PUT',
        body: formData
      });

      appendLog('INFO', 'UI', `Updated ${getImageDisplayName(data?.image) || getImageDisplayName(selectedImage)}`);
      setUpdateFile(null);
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

    const confirmed = window.confirm(`Delete ${getImageDisplayName(selectedImage)}? This action cannot be undone.`);
    if (!confirmed) {
      return;
    }

    try {
      await requestJson(`${API_BASE}/api/images/${selectedImage.imageId || selectedImage._id}`, {
        method: 'DELETE'
      });

      appendLog('INFO', 'UI', `Deleted ${getImageFileName(selectedImage)}`);
      await refreshImages();
      setSelectedImage(null);
    } catch (error) {
      appendLog('ERROR', 'UI', error.message);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginStatus('Signing in...');

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const bodyText = await response.text();
      const data = bodyText ? JSON.parse(bodyText) : {};
      if (!response.ok) {
        throw new Error(data.message || 'Login failed. Check your username and password.');
      }

      setAuthToken(data.token);
      localStorage.setItem('authToken', data.token);
      setLoginStatus('Authenticated. Protected pages are now available.');
      appendLog('INFO', 'AUTH', 'Logged in successfully');
      setPassword('');
    } catch (error) {
      setLoginStatus(error.message);
      appendLog('ERROR', 'AUTH', error.message);
    }
  };

  const handleHealthCheck = async () => {
    if (!authToken) {
      setHealthStatus('Please log in before checking the protected backend health route.');
      return;
    }

    try {
      setHealthStatus('Checking protected backend health...');
      const result = await requestJson(`${API_BASE}/api/health/ready`);
      setHealthResult(result);
      setHealthStatus('Protected health check completed.');
    } catch (error) {
      setHealthResult(null);
      setHealthStatus(`Unable to load protected health data: ${error.message}`);
      appendLog('ERROR', 'HEALTH', error.message);
    }
  };

  const handleDeleteAll = async () => {
    if (!authToken) {
      setDeleteAllStatus('Please log in before deleting all images.');
      return;
    }

    const confirmed = window.confirm('Delete all images? This action cannot be undone.');
    if (!confirmed) {
      return;
    }

    try {
      setDeleteAllStatus('Deleting all images...');
      const result = await requestJson(`${API_BASE}/api/images/delete-all`, {
        method: 'DELETE'
      });

      const message = result?.message || 'Deleted all images';
      setDeleteAllStatus(message);
      appendLog('INFO', 'UI', message);
      await refreshImages();
      setSelectedImage(null);
      setSelectedImageId('');
    } catch (error) {
      setDeleteAllStatus(`Unable to delete all images: ${error.message}`);
      appendLog('ERROR', 'UI', error.message);
    }
  };

  const renderHomePage = () => (
    <>
      <section className="page-heading">
        <h1>S3 Image Manager</h1>
        <p>List, preview, upload, update, and delete individual images through the backend API.</p>
      </section>

      <main className="grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Images</h2>
            <button type="button" className="secondary-button" onClick={refreshImages}>Refresh</button>
          </div>
          {loading ? <p>Loading images...</p> : null}
          <ul className="image-list">
            {images.map((image) => {
              const id = getImageId(image);
              return (
                <li key={id}>
                  <button type="button" className={selectedImageId === id ? 'active' : ''} onClick={() => handleSelectImage(id)}>
                    <strong>{getImageDisplayName(image)}</strong>
                    <span>{getImageFileName(image)}</span>
                    <span>{formatDateTime(image.uploadedAt)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!loading && images.length === 0 ? <p className="helper-text">No images are available yet.</p> : null}
        </section>

        <section className="panel">
          <h2>Selected Image</h2>
          {selectedImage ? (
            <>
              <dl className="metadata-list">
                <div>
                  <dt>Display name</dt>
                  <dd>{getImageDisplayName(selectedImage)}</dd>
                </div>
                <div>
                  <dt>File name</dt>
                  <dd>{getImageFileName(selectedImage)}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{formatFileSize(selectedImage.size)}</dd>
                </div>
                <div>
                  <dt>MIME type</dt>
                  <dd>{selectedImage.mimeType || 'Not available'}</dd>
                </div>
                <div>
                  <dt>Uploaded</dt>
                  <dd>{formatDateTime(selectedImage.uploadedAt)}</dd>
                </div>
                <div>
                  <dt>Last updated</dt>
                  <dd>{formatDateTime(selectedImage.updatedAt)}</dd>
                </div>
                <div className="metadata-wide">
                  <dt>CloudFront URL</dt>
                  <dd>
                    {getImageRenderUrl(selectedImage) ? (
                      <a href={getImageRenderUrl(selectedImage)} target="_blank" rel="noreferrer">{getImageRenderUrl(selectedImage)}</a>
                    ) : (
                      'Not configured by backend'
                    )}
                  </dd>
                </div>
              </dl>
              {getImageRenderUrl(selectedImage) ? (
                <img src={getImageRenderUrl(selectedImage)} alt={getImageDisplayName(selectedImage)} />
              ) : (
                <div className="image-placeholder" role="status">
                  CloudFront URL unavailable. Set AWS_CLOUDFRONT_DOMAIN_NAME in the backend to render this image.
                </div>
              )}
              <div className="actions">
                <button type="button" className="danger-button" onClick={handleDelete}>Delete image</button>
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
            <button type="submit">Upload</button>
          </form>
          <p className="helper-text">Maximum upload size: {formatFileSize(MAX_IMAGE_SIZE_BYTES)}</p>
        </div>

        <div>
          <h2>Update selected image</h2>
          <form onSubmit={handleUpdate} className="form-stack">
            <input type="file" accept="image/*" onChange={(event) => setUpdateFile(event.target.files?.[0] || null)} />
            <button type="submit">Update</button>
          </form>
        </div>
      </section>
    </>
  );

  const renderLoginPage = () => (
    <section className="page-heading narrow-page">
      <h1>Login</h1>
      <p>Authenticate with the backend to access JWT-protected routes.</p>

      <div className="panel">
        <form onSubmit={handleLogin} className="form-stack">
          <label>
            Username
            <input type="text" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          </label>
          <button type="submit">Login</button>
          <p className="helper-text">{loginStatus}</p>
        </form>
      </div>
    </section>
  );

  const renderHealthPage = () => (
    <section className="page-heading">
      <h1>Protected Health Check</h1>
      <p>Query the backend readiness endpoint that requires a valid JWT.</p>

      <AuthNotice token={authToken}>
        You are not authenticated yet. Go to Login, sign in, then return here to check backend readiness.
      </AuthNotice>

      <div className="panel">
        <div className="panel-heading">
          <h2>Backend readiness</h2>
          <button type="button" onClick={handleHealthCheck} disabled={!authToken}>Check health</button>
        </div>
        {healthStatus ? <p className="helper-text">{healthStatus}</p> : null}
        {healthResult ? <pre className="json-output">{JSON.stringify(healthResult, null, 2)}</pre> : null}
      </div>
    </section>
  );

  const renderDeleteAllPage = () => (
    <section className="page-heading narrow-page">
      <h1>Delete All Images</h1>
      <p>Use the protected backend route to remove all image records and S3 objects.</p>

      <AuthNotice token={authToken}>
        You are not authenticated yet. Log in before using this protected delete action.
      </AuthNotice>

      <div className="panel danger-panel">
        <h2>Protected bulk delete</h2>
        <p>This action calls <code>DELETE /api/images/delete-all</code> and cannot be undone from the frontend.</p>
        <button type="button" className="danger-button" onClick={handleDeleteAll} disabled={!authToken}>Delete all images</button>
        {deleteAllStatus ? <p className="helper-text">{deleteAllStatus}</p> : null}
      </div>
    </section>
  );

  const renderPage = () => {
    if (page === 'login') {
      return renderLoginPage();
    }

    if (page === 'health') {
      return renderHealthPage();
    }

    if (page === 'deleteAll') {
      return renderDeleteAllPage();
    }

    return renderHomePage();
  };

  return (
    <div className="app-shell">
      <nav className="navbar" aria-label="Primary navigation">
        <button type="button" className="brand-button" onClick={() => navigate('home')}>S3 Image Manager</button>
        <div className="nav-links">
          <button type="button" className={page === 'home' ? 'active' : ''} onClick={() => navigate('home')}>Home</button>
          <button type="button" className={page === 'login' ? 'active' : ''} onClick={() => navigate('login')}>Login</button>
          <button type="button" className={page === 'health' ? 'active' : ''} onClick={() => navigate('health')}>Health</button>
          <button type="button" className={page === 'deleteAll' ? 'active' : ''} onClick={() => navigate('deleteAll')}>Delete All</button>
        </div>
        <div className="auth-chip">
          <span className={authToken ? 'status-dot authenticated' : 'status-dot'} aria-hidden="true" />
          <span>{authToken ? 'Authenticated' : 'Signed out'}</span>
          {authToken ? <button type="button" className="link-button" onClick={logout}>Logout</button> : null}
        </div>
      </nav>

      {renderPage()}

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
