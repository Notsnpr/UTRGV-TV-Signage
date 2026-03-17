(function() {
  let users = [];

  async function loadSidebar() {
    const res = await fetch('/admin/components/sidebar.html');
    document.getElementById('sidebar').outerHTML = await res.text();
    document.getElementById('logoutBtn')?.addEventListener('click', Shared.logout);
    const user = Shared.getUser();
    if (user) {
      document.getElementById('userName').textContent = user.username;
      document.getElementById('userEmail').textContent = user.email;
      document.getElementById('userAvatar').textContent = user.username.charAt(0).toUpperCase();
      if (user.role === 'admin') {
        document.getElementById('userRole').textContent = 'Administrator';
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
      }
      document.querySelector('.nav-link[data-page="users"]')?.classList.add('active');
    }
  }

  async function loadUsers() {
    try {
      users = await Shared.api('/api/admin/users');
      const tbody = document.getElementById('usersBody');
      if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No users yet</td></tr>';
        return;
      }
      const currentUser = Shared.getUser();
      tbody.innerHTML = users.map(u => `
        <tr>
          <td><strong>${Shared.escapeHtml(u.username)}</strong></td>
          <td>${Shared.escapeHtml(u.email)}</td>
          <td><span class="badge ${u.role === 'admin' ? 'badge-primary' : 'badge-gray'}">${u.role}</span></td>
          <td>${u.tvAccessCount}</td>
          <td>${Shared.formatDate(u.createdAt)}</td>
          <td style="display:flex;gap:6px">
            <button class="btn btn-sm btn-secondary" data-edit="${u.id}">Edit</button>
            <button class="btn btn-sm btn-danger-outline" data-delete="${u.id}" ${u.id === currentUser?.id ? 'disabled title="Cannot delete yourself"' : ''}>Delete</button>
          </td>
        </tr>
      `).join('');
      tbody.querySelectorAll('[data-edit]').forEach(btn =>
        btn.addEventListener('click', () => openEdit(users.find(u => u.id == btn.dataset.edit))));
      tbody.querySelectorAll('[data-delete]:not([disabled])').forEach(btn =>
        btn.addEventListener('click', () => deleteUser(btn.dataset.delete)));
    } catch (e) {}
  }

  async function addUser() {
    const data = {
      username: document.getElementById('newUsername').value.trim(),
      email: document.getElementById('newEmail').value.trim(),
      password: document.getElementById('newPassword').value,
      role: document.getElementById('newRole').value,
    };
    if (!data.username || !data.email || !data.password)
      return Shared.showToast('Fill all required fields', 'error');
    try {
      await Shared.api('/api/admin/users', { method: 'POST', body: JSON.stringify(data) });
      Shared.closeModal('addUserModal');
      ['newUsername','newEmail','newPassword'].forEach(id => { document.getElementById(id).value = ''; });
      document.getElementById('newRole').value = 'user';
      await loadUsers();
      Shared.showToast('User created', 'success');
    } catch (e) {}
  }

  function openEdit(user) {
    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUsername').value = user.username;
    document.getElementById('editUserEmail').value = user.email;
    document.getElementById('editPassword').value = '';
    document.getElementById('editRole').value = user.role;
    Shared.openModal('editUserModal');
  }

  async function saveUser() {
    const id = document.getElementById('editUserId').value;
    const data = {
      username: document.getElementById('editUsername').value.trim(),
      email: document.getElementById('editUserEmail').value.trim(),
      role: document.getElementById('editRole').value,
    };
    const password = document.getElementById('editPassword').value;
    if (password) data.password = password;
    try {
      await Shared.api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      Shared.closeModal('editUserModal');
      await loadUsers();
      Shared.showToast('User updated', 'success');
    } catch (e) {}
  }

  async function deleteUser(id) {
    if (!confirm('Delete this user?')) return;
    try {
      await Shared.api(`/api/admin/users/${id}`, { method: 'DELETE' });
      await loadUsers();
      Shared.showToast('User deleted');
    } catch (e) {}
  }

  async function init() {
    const user = await Shared.checkAuth();
    if (!user || user.role !== 'admin') {
      window.location.href = '/admin/';
      return;
    }
    await loadSidebar();
    await loadUsers();

    document.getElementById('addUserBtn').addEventListener('click', () => Shared.openModal('addUserModal'));
    document.getElementById('closeAddUser').addEventListener('click', () => Shared.closeModal('addUserModal'));
    document.getElementById('cancelAddUser').addEventListener('click', () => Shared.closeModal('addUserModal'));
    document.getElementById('confirmAddUser').addEventListener('click', addUser);

    document.getElementById('closeEditUser').addEventListener('click', () => Shared.closeModal('editUserModal'));
    document.getElementById('cancelEditUser').addEventListener('click', () => Shared.closeModal('editUserModal'));
    document.getElementById('confirmEditUser').addEventListener('click', saveUser);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
