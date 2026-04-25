const k8s = require('@kubernetes/client-node');
const uuid = require('uuid');

const MOCK_MODE = process.env.MOCK_MODE === 'true';

let k8sApi = null;

if (!MOCK_MODE) {
  try {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    k8sApi = kc.makeApiClient(k8s.CoreV1Api);
  } catch (err) {
    console.warn('K8s connection failed, falling back to mock mode:', err.message);
  }
}

const mockNamespaces = new Set();

function createNamespace(sessionId) {
  const namespace = `sandbox-${sessionId}`;

  if (MOCK_MODE || !k8sApi) {
    mockNamespaces.add(namespace);
    console.log(`[MOCK] Created namespace: ${namespace}`);
    return Promise.resolve(namespace);
  }

  const ns = {
    metadata: {
      name: namespace,
      labels: {
        'sandbox-session': sessionId,
        'app': 'k8s-sandbox'
      }
    }
  };

  return k8sApi.createNamespace(ns).then((res) => {
    return namespace;
  }).catch((err) => {
    if (err.response && err.response.statusCode === 409) {
      return namespace;
    }
    throw err;
  });
}

function applyResourceQuota(namespace, sessionId) {
  if (MOCK_MODE || !k8sApi) {
    console.log(`[MOCK] Applied resource quota to: ${namespace}`);
    return Promise.resolve(namespace);
  }

  const quota = {
    metadata: {
      name: `quota-${sessionId}`,
      namespace: namespace
    },
    spec: {
      hard: {
        'pods': '10',
        'secrets': '5',
        'services': '5',
        'persistentvolumeclaims': '2',
        'cpu': '2',
        'memory': '4Gi'
      }
    }
  };

  return k8sApi.createNamespacedResourceQuota(namespace, quota).then(() => {
    return namespace;
  });
}

function deleteNamespace(namespace) {
  if (MOCK_MODE || !k8sApi) {
    mockNamespaces.delete(namespace);
    console.log(`[MOCK] Deleted namespace: ${namespace}`);
    return Promise.resolve(true);
  }

  return k8sApi.deleteNamespace(namespace).then(() => {
    return true;
  }).catch((err) => {
    if (err.response && err.response.statusCode === 404) {
      return true;
    }
    throw err;
  });
}

function listSandboxNamespaces() {
  if (MOCK_MODE || !k8sApi) {
    return Promise.resolve(Array.from(mockNamespaces));
  }

  return k8sApi.listNamespace().then((res) => {
    return res.body.items
      .filter(ns => ns.metadata.labels && ns.metadata.labels['app'] === 'k8s-sandbox')
      .map(ns => ns.metadata.name);
  });
}

function createSession(isPro = false) {
  const sessionId = uuid.v4();
  const namespace = `sandbox-${sessionId}`;
  const now = new Date();
  const expiresIn = isPro ? 120 : 60;
  now.setMinutes(now.getMinutes() + expiresIn);
  const expiresAt = now.toISOString();

  return createNamespace(sessionId)
    .then(() => applyResourceQuota(namespace, sessionId))
    .then(() => {
      return {
        sessionId,
        namespace,
        expiresAt
      };
    });
}

function cleanupNamespace(namespace) {
  return deleteNamespace(namespace);
}

module.exports = {
  createSession,
  deleteNamespace,
  listSandboxNamespaces,
  cleanupNamespace
};
