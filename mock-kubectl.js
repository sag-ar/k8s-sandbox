// Mock kubectl handler for testing without a real K8s cluster
// Intercepts kubectl commands and returns realistic mock responses.

function handleKubectlCommand(command) {
  const cmd = command.trim();

  // Remove 'kubectl ' prefix
  const kubectlCmd = cmd.startsWith('kubectl ') ? cmd.slice(8).trim() : cmd;

  // Parse the command
  if (kubectlCmd.match(/^get\s+pods?/)) {
    return mockGetPods(kubectlCmd);
  }

  if (kubectlCmd.match(/^get\s+nodes?/)) {
    return mockGetNodes();
  }

  if (kubectlCmd.match(/^get\s+namespaces?/)) {
    return mockGetNamespaces();
  }

  if (kubectlCmd.match(/^get\s+services?/)) {
    return mockGetServices();
  }

  if (kubectlCmd.match(/^get\s+deployments?/)) {
    return mockGetDeployments();
  }

  if (kubectlCmd.match(/^cluster-info/)) {
    return 'Kubernetes control plane is running at https://mock-cluster:6443\r\n';
  }

  if (kubectlCmd.match(/^version/)) {
    return 'Client Version: v1.28.0\r\nServer Version: v1.28.0\r\n';
  }

  if (kubectlCmd.match(/^run\s+/)) {
    const match = kubectlCmd.match(/run\s+(\S+)/);
    const podName = match ? match[1] : 'unknown';
    return `pod/${podName} created\r\n`;
  }

  if (kubectlCmd.match(/^delete\s+pod/)) {
    return 'pod deleted\r\n';
  }

  if (kubectlCmd.match(/^describe\s+pod/)) {
    return 'Name:\tnginx\r\nNamespace:\tdefault\r\nStatus:\tRunning\r\nReady:\tTrue\r\n';
  }

  if (kubectlCmd.match(/^logs\s+/)) {
    return '[mock] Pod logs would appear here\r\n';
  }

  if (kubectlCmd.match(/^help/)) {
    return 'kubectl controls the Kubernetes cluster manager.\r\n';
  }

  // Default: command not mocked
  return `[Mock Mode] Command '${kubectlCmd}' not mocked yet.\r\nTry: kubectl get pods\r\n`;
}

// Simple output format - just use consistent spacing
function mockGetPods(cmd) {
  let output = 'NAME                 READY   STATUS    RESTARTS   AGE\r\n';
  output += 'nginx                1/1     Running   0          5m\r\n';
  output += 'mock-pod-1           1/1     Running   0          3m\r\n';
  output += 'mock-pod-2           1/1     Pending   0          1m\r\n';
  return output;
}

function mockGetNodes() {
  let output = 'NAME               STATUS   ROLES    AGE       VERSION\r\n';
  output += 'mock-node-1         Ready    <none>   10m       v1.28.0\r\n';
  output += 'mock-node-2         Ready    <none>   10m       v1.28.0\r\n';
  return output;
}

function mockGetNamespaces() {
  let output = 'NAME              STATUS   AGE\r\n';
  output += 'default           Active   20m\r\n';
  output += 'kube-system       Active   20m\r\n';
  output += 'kube-public       Active   20m\r\n';
  output += 'sandbox-mock      Active   5m\r\n';
  return output;
}

function mockGetServices() {
  let output = 'NAME         TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)    AGE\r\n';
  output += 'kubernetes   ClusterIP   10.96.0.1      <none>        443/TCP    20m\r\n';
  output += 'nginx        ClusterIP   10.96.1.2      <none>        80/TCP     5m\r\n';
  return output;
}

function mockGetDeployments() {
  let output = 'NAME   READY   UP-TO-DATE   AVAILABLE   AGE\r\n';
  output += 'nginx   1/1     1            1           5m\r\n';
  return output;
}

module.exports = {
  handleKubectlCommand,
  mockGetPods,
  mockGetNodes,
  mockGetNamespaces
};
