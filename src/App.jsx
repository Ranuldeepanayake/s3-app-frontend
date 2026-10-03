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

const getCookie = (name) => document.cookie
  .split('; ')
  .find((cookie) => cookie.startsWith(`${name}=`))
  ?.split('=')[1];

const setCookie = (name, value) => {
  document.cookie = `${name}=${value}; Max-Age=31536000; Path=/; SameSite=Lax`;
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

const HealthStatus = ({ name, status }) => {
  const normalizedStatus = status === 'up' ? 'up' : status === 'down' ? 'down' : 'unknown';
  const label = normalizedStatus === 'unknown' ? 'Not reported' : normalizedStatus;

  return (
    <div className={`health-status ${normalizedStatus}`}>
      <span className="health-status-dot" aria-hidden="true" />
      <span className="health-status-name">{name}</span>
      <strong className="health-status-value">{label}</strong>
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
  const [backendVersion, setBackendVersion] = useState('Loading...');
  const [trafficInterval, setTrafficInterval] = useState('1000');
  const [trafficParallelQueries, setTrafficParallelQueries] = useState('1');
  const [trafficWorkload, setTrafficWorkload] = useState('light');
  const [scratchRows, setScratchRows] = useState('100000');
  const [scratchBlobBytes, setScratchBlobBytes] = useState('4096');
  const [trafficStatus, setTrafficStatus] = useState(null);
  const [trafficMessage, setTrafficMessage] = useState('');
  const [restartStatus, setRestartStatus] = useState('');
  const [theme, setTheme] = useState(() => getCookie('s3-app-theme') || 'light');
  const [publicHealthResult, setPublicHealthResult] = useState(null);

  useEffect(() => {
    const handlePopState = () => setPage(getCurrentPage());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    setCookie('s3-app-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (page !== 'health') {
      return undefined;
    }

    fetch(`${API_BASE}/api/health/live`)
      .then(async (response) => {
        const data = await response.json();
        if (data?.mongodb || data?.s3 || data?.postgresql) {
          setPublicHealthResult(data);
        }
      })
      .catch(() => setPublicHealthResult(null));

    return undefined;
  }, [page]);

  useEffect(() => {
    fetch(`${API_BASE}/api/version`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || 'Unable to load backend version.');
        }
        setBackendVersion(data.version || 'Unknown');
      })
      .catch((error) => setBackendVersion(`Unavailable (${error.message})`));
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
    if (!authToken) {
      appendLog('WARN', 'AUTH', 'Login is required before uploading images');
      return;
    }
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
    if (!authToken) {
      appendLog('WARN', 'AUTH', 'Login is required before updating images');
      return;
    }
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
    if (!authToken) {
      appendLog('WARN', 'AUTH', 'Login is required before deleting images');
      return;
    }

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
      const url = `${API_BASE}/api/health/ready`;
      appendLog('INFO', 'UI', `Request GET ${url}`);
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      const bodyText = await response.text();
      const contentType = response.headers.get('content-type') || '';
      appendLog('INFO', 'UI', `Response GET ${url} -> ${response.status} ${contentType}`);

      if (!contentType.includes('application/json')) {
        throw new Error(getMessageFromErrorBody(bodyText, `Health check failed with status ${response.status}`));
      }

      const result = bodyText ? JSON.parse(bodyText) : {};
      const hasDependencyStatuses = result.mongodb || result.s3 || result.postgresql;
      if (!response.ok && !hasDependencyStatuses) {
        throw new Error(result.message || `Health check failed with status ${response.status}`);
      }

      setHealthResult(result);
      const isHealthy = response.ok && result.status === 'ok';
      setHealthStatus(isHealthy
        ? 'All dependencies are healthy.'
        : `Backend is degraded (HTTP ${response.status}). Review the dependency statuses below.`);
      appendLog(isHealthy ? 'INFO' : 'WARN', 'HEALTH', `Backend health status: ${result.status || 'unknown'}`);
    } catch (error) {
      setHealthResult(null);
      setHealthStatus(`Unable to load protected health data: ${error.message}`);
      appendLog('ERROR', 'HEALTH', error.message);
    }
  };

  const refreshTrafficStatus = async () => {
    if (!authToken) {
      return;
    }

    try {
      const result = await requestJson(`${API_BASE}/api/health/traffic`);
      setTrafficStatus(result);
    } catch (error) {
      setTrafficMessage(`Unable to load traffic status: ${error.message}`);
    }
  };

  useEffect(() => {
    if (page !== 'health' || !authToken) {
      return undefined;
    }

    refreshTrafficStatus();
    const statusTimer = setInterval(refreshTrafficStatus, 2000);
    return () => clearInterval(statusTimer);
  }, [page, authToken]);

  const handleStartTraffic = async () => {
    try {
      setTrafficMessage('Starting PostgreSQL test traffic...');
      const result = await requestJson(`${API_BASE}/api/health/traffic/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intervalMs: trafficInterval,
          parallelQueries: trafficParallelQueries,
          workload: trafficWorkload,
          scratchRows,
          scratchBlobBytes
        })
      });
      setTrafficStatus(result);
      setTrafficMessage('PostgreSQL test traffic is running.');
    } catch (error) {
      setTrafficMessage(`Unable to start test traffic: ${error.message}`);
    }
  };

  const handleStopTraffic = async () => {
    try {
      setTrafficMessage('Stopping PostgreSQL test traffic...');
      const result = await requestJson(`${API_BASE}/api/health/traffic/stop`, { method: 'POST' });
      setTrafficStatus(result);
      setTrafficMessage('PostgreSQL test traffic stopped.');
    } catch (error) {
      setTrafficMessage(`Unable to stop test traffic: ${error.message}`);
    }
  };

  const handleRestart = async () => {
    if (!window.confirm('Restart the backend service now? The service must have a supervisor to start again.')) {
      return;
    }

    try {
      const result = await requestJson(`${API_BASE}/api/health/restart`, { method: 'POST' });
      setRestartStatus(result.message || 'Backend restart requested.');
    } catch (error) {
      setRestartStatus(`Unable to request backend restart: ${error.message}`);
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
                <button type="button" className="danger-button" onClick={handleDelete} disabled={!authToken}>Delete image</button>
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
            <input className="file-picker" type="file" accept="image/*" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} disabled={!authToken} />
            <button type="submit" className="primary-button" disabled={!authToken}>Upload</button>
          </form>
          <p className="helper-text">Maximum upload size: {formatFileSize(MAX_IMAGE_SIZE_BYTES)}</p>
        </div>

        <div>
          <h2>Update selected image</h2>
          <form onSubmit={handleUpdate} className="form-stack">
            <input className="file-picker" type="file" accept="image/*" onChange={(event) => setUpdateFile(event.target.files?.[0] || null)} disabled={!authToken} />
            <button type="submit" className="primary-button" disabled={!authToken}>Update</button>
          </form>
        </div>
      </section>
    </>
  );

  const renderLoginPage = () => (
    <section className="page-heading narrow-page">
      <h1>Login</h1>
      <p>Sign in with an application account stored in the PostgreSQL database to access protected routes.</p>

      <div className="panel login-panel">
        <form onSubmit={handleLogin} className="form-stack">
          <label>
            Application username
            <input className="login-input" type="text" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            Application password
            <input className="login-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          </label>
          <button type="submit" className="primary-button login-submit">Sign in</button>
          <p className="helper-text">{loginStatus}</p>
        </form>
      </div>
    </section>
  );

  const renderHealthPage = () => (
    <section className="page-heading">
      <h1>Protected Health Check</h1>
      <p>Check MongoDB, S3, and PostgreSQL connectivity through the protected readiness endpoint.</p>

      <AuthNotice token={authToken}>
        You are not authenticated yet. Go to Login, sign in, then return here to check backend readiness.
      </AuthNotice>

      <div className="panel">
        <div className="panel-heading">
          <h2>Backend readiness</h2>
          <button type="button" onClick={handleHealthCheck} disabled={!authToken}>Check health</button>
        </div>
        {healthStatus ? <p className="helper-text">{healthStatus}</p> : null}
        {publicHealthResult || healthResult ? (
          <>
            <div className={`health-grid overall-${(healthResult || publicHealthResult).status === 'ok' ? 'up' : 'down'}`} aria-live="polite">
              <HealthStatus name="Overall" status={(healthResult || publicHealthResult).status === 'ok' ? 'up' : 'down'} />
              <HealthStatus name="MongoDB" status={(healthResult || publicHealthResult).mongodb?.status} />
              <HealthStatus name="S3" status={(healthResult || publicHealthResult).s3?.status} />
              <HealthStatus name="PostgreSQL" status={(healthResult || publicHealthResult).postgresql?.status} />
            </div>
            {healthResult ? (
              <details className="health-details">
                <summary>Protected response details</summary>
                <pre className="json-output">{JSON.stringify(healthResult, null, 2)}</pre>
              </details>
            ) : <p className="helper-text">Component status is available without authentication. Sign in to view protected infrastructure details.</p>}
          </>
        ) : null}
      </div>

      <div className="health-control-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>PostgreSQL test traffic</h2>
            <span className={`traffic-indicator ${trafficStatus?.running ? 'running' : ''}`}>
              {trafficStatus?.running ? 'Running' : 'Stopped'}
            </span>
          </div>
          <p className="helper-text">Run read-only synthetic PostgreSQL work that exercises CPU and temporary working memory for performance monitoring. Statistics refresh automatically while this page is open.</p>
          <div className="traffic-form">
            <label>
              Interval (milliseconds)
              <input type="text" inputMode="numeric" value={trafficInterval} onChange={(event) => setTrafficInterval(event.target.value)} />
            </label>
            <label>
              Parallel queries
              <input type="text" inputMode="numeric" value={trafficParallelQueries} onChange={(event) => setTrafficParallelQueries(event.target.value)} />
            </label>
            <label>
              Workload
              <select value={trafficWorkload} onChange={(event) => setTrafficWorkload(event.target.value)}>
                <option value="light">Light query</option>
                <option value="scratch">Scratch transaction</option>
              </select>
            </label>
            {trafficWorkload === 'scratch' ? (
              <>
                <label>
                  Scratch rows
                  <input type="text" inputMode="numeric" value={scratchRows} onChange={(event) => setScratchRows(event.target.value)} />
                </label>
                <label>
                  Blob bytes per row
                  <input type="text" inputMode="numeric" value={scratchBlobBytes} onChange={(event) => setScratchBlobBytes(event.target.value)} />
                </label>
              </>
            ) : null}
          </div>
          <div className="actions">
            <button type="button" onClick={handleStartTraffic} disabled={!authToken || trafficStatus?.running}>Start traffic</button>
            <button type="button" className="secondary-button" onClick={handleStopTraffic} disabled={!authToken || !trafficStatus?.running}>Stop traffic</button>
            <button type="button" className="secondary-button" onClick={refreshTrafficStatus} disabled={!authToken}>Refresh status</button>
          </div>
          {trafficMessage ? <p className="helper-text">{trafficMessage}</p> : null}
          {trafficStatus ? (
            <dl className="metadata-list traffic-metadata">
              <div><dt>Queries succeeded</dt><dd>{trafficStatus.successfulQueries}</dd></div>
              <div><dt>Queries failed</dt><dd>{trafficStatus.failedQueries}</dd></div>
              <div><dt>Runs</dt><dd>{trafficStatus.totalRuns}</dd></div>
              <div><dt>Last run</dt><dd>{formatDateTime(trafficStatus.lastRunAt)}</dd></div>
            </dl>
          ) : null}
        </section>

        <section className="panel">
          <h2>Backend service</h2>
          <p className="helper-text">Request a process restart to exercise the normal startup checks and startup logs. A process supervisor must be configured for automatic recovery.</p>
          <button type="button" className="danger-button" onClick={handleRestart} disabled={!authToken}>Restart backend</button>
          {restartStatus ? <p className="helper-text">{restartStatus}</p> : null}
        </section>
      </div>

      <section className="panel version-panel">
        <h2>Application version</h2>
        <p className="version-value">Backend <strong>{healthResult?.version || backendVersion}</strong></p>
        <p className="helper-text">This value is read from the backend package.json file.</p>
      </section>
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
          <button type="button" className={page === 'health' ? 'active' : ''} onClick={() => navigate('health')}>Health</button>
          <button type="button" className={page === 'deleteAll' ? 'active' : ''} onClick={() => navigate('deleteAll')}>Delete All</button>
        </div>
        <div className="nav-spacer" />
        <span className="app-version">Backend v{backendVersion}</span>
        <button type="button" className="theme-toggle" onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <div className="auth-chip">
          <span className={authToken ? 'status-dot authenticated' : 'status-dot'} aria-hidden="true" />
          <span>{authToken ? 'Authenticated' : 'Signed out'}</span>
          {authToken ? <button type="button" className="nav-action logout-button" onClick={logout}>Logout</button> : <button type="button" className="nav-action login-button" onClick={() => navigate('login')}>Login</button>}
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
      <footer className="app-footer">Backend version: {backendVersion}</footer>
    </div>
  );
}

export default App;
