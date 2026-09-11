const $ = (id) => document.getElementById(id);
const folder = $("folder");
const selection = $("selection");
const statusBox = $("status");
const publishButton = $("publish");
const createButton = $("create-repo");

function credentials() {
  return { owner: $("owner").value.trim(), repo: $("repo").value.trim(), token: $("token").value.trim() };
}

function show(message, type = "") {
  statusBox.hidden = false;
  statusBox.className = `status ${type}`;
  statusBox.innerHTML = message;
}

function assertCredentials() {
  const values = credentials();
  if (!values.owner || !values.repo || !values.token) throw new Error("请填写 GitHub 用户名、仓库名和个人访问令牌。");
  if (!/^[\w.-]+$/.test(values.repo)) throw new Error("仓库名只能包含字母、数字、点、下划线或连字符。");
  return values;
}

async function github(path, options = {}) {
  const { token } = credentials();
  const response = await fetch(`https://api.github.com${path}`, { ...options, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", ...(options.headers || {}) } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || `GitHub 请求失败 (${response.status})`); }
  return response.status === 204 ? null : response.json();
}

function encode(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error(`无法读取 ${file.name}`)); reader.onload = () => resolve(reader.result.split(",")[1]); reader.readAsDataURL(file); });
}

function safePath(file) {
  const raw = file.webkitRelativePath || file.name;
  const parts = raw.replaceAll("\\", "/").split("/").filter((part) => part && part !== "." && part !== "..");
  if (!parts.length) throw new Error("发现无效的文件路径。");
  return parts.map(encodeURIComponent).join("/");
}

folder.addEventListener("change", () => {
  const files = [...folder.files];
  const html = files.filter((file) => /\.html?$/i.test(file.name));
  selection.textContent = files.length ? `已选择 ${files.length} 个文件；检测到 ${html.length} 个 HTML 文件。` : "尚未选择文件夹";
});

async function ensurePages(owner, repo) {
  try { await github(`/repos/${owner}/${repo}/pages`); }
  catch (error) {
    if (!/Not Found/i.test(error.message)) throw error;
    try { await github(`/repos/${owner}/${repo}/pages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: { branch: "main", path: "/" } }) }); }
    catch (createError) { if (!/already exists|unprocessable/i.test(createError.message)) throw createError; }
  }
}

createButton.addEventListener("click", async () => {
  try {
    const { repo } = assertCredentials();
    createButton.disabled = true; show("正在创建公开仓库…");
    const result = await github("/user/repos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: repo, description: "HTML projects published by HTML Publisher", private: false, auto_init: true }) });
    $("owner").value = result.owner.login;
    show(`仓库已创建：<a href="${result.html_url}" target="_blank" rel="noopener">${result.html_url}</a>`, "success");
  } catch (error) { show(error.message, "error"); }
  finally { createButton.disabled = false; }
});

publishButton.addEventListener("click", async () => {
  try {
    const { owner, repo } = assertCredentials();
    const files = [...folder.files];
    const entry = files.find((file) => /^index\.html?$/i.test(file.name)) || files.find((file) => /\.html?$/i.test(file.name));
    if (!entry) throw new Error("所选文件夹中没有 HTML 文件。");
    if (!files.length) throw new Error("请先选择项目文件夹。");
    publishButton.disabled = true;
    const id = `${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 8)}`;
    for (let i = 0; i < files.length; i++) {
      const file = files[i]; const relative = safePath(file); const content = await encode(file);
      show(`正在上传 ${i + 1}/${files.length}：${file.name}`);
      await github(`/repos/${owner}/${repo}/contents/projects/${id}/${relative}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: `publish ${id}: ${relative}`, content, branch: "main" }) });
    }
    await ensurePages(owner, repo);
    const link = `https://${owner}.github.io/${repo}/projects/${id}/${safePath(entry)}`;
    show(`上传完成。GitHub Pages 通常需要约 1–3 分钟首次发布。<br><a href="${link}" target="_blank" rel="noopener">${link}</a>`, "success");
  } catch (error) { show(error.message, "error"); }
  finally { publishButton.disabled = false; }
});
