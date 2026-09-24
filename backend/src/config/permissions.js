// Central role → permission map. Every admin route declares the permission it needs,
// so roles can be differentiated later by editing this file only.

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  MANAGER: 'manager',
});

export const ROLE_LABELS = Object.freeze({
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.MANAGER]: 'Store Manager',
});

export const PERMISSIONS = Object.freeze({
  DASHBOARD_READ: 'dashboard:read',
  REPORTS_READ: 'reports:read',
  CUSTOMERS_READ: 'customers:read',
  CUSTOMERS_WRITE: 'customers:write',
  PURCHASES_READ: 'purchases:read',
  PURCHASES_WRITE: 'purchases:write',
  PURCHASES_CANCEL: 'purchases:cancel',
  LOYALTY_READ: 'loyalty:read',
  LOYALTY_ADJUST: 'loyalty:adjust',
  SETTINGS_READ: 'settings:read',
  SETTINGS_WRITE: 'settings:write',
});

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

// Managers currently have the same permissions as admins.
const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.ADMIN]: new Set(ALL_PERMISSIONS),
  [ROLES.MANAGER]: new Set(ALL_PERMISSIONS),
});

export const hasPermission = (role, permission) => ROLE_PERMISSIONS[role]?.has(permission) ?? false;
