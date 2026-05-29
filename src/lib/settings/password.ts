export const MIN_PASSWORD_LENGTH = 10;

export type PasswordValidationResult = {
  issues: string[];
  strongEnough: boolean;
  warnings: string[];
};

export function validateNewPassword(password: string): PasswordValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    issues.push(`新密码至少需要 ${MIN_PASSWORD_LENGTH} 位。`);
  }

  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    warnings.push("建议新密码同时包含字母和数字。");
  }

  return {
    issues,
    strongEnough: issues.length === 0,
    warnings,
  };
}

export function isSamePasswordValue(
  currentPassword: string,
  newPassword: string,
): boolean {
  return currentPassword === newPassword;
}

export function validatePasswordChangeFields(input: {
  confirmPassword: string;
  currentPassword: string;
  newPassword: string;
}): PasswordValidationResult {
  const result = validateNewPassword(input.newPassword);
  const issues = [...result.issues];

  if (!input.currentPassword || !input.newPassword || !input.confirmPassword) {
    issues.push("请填写完整的密码表单。");
  }

  if (isSamePasswordValue(input.currentPassword, input.newPassword)) {
    issues.push("新密码不能和当前密码相同。");
  }

  if (input.newPassword !== input.confirmPassword) {
    issues.push("两次输入的新密码不一致。");
  }

  return {
    issues: Array.from(new Set(issues)),
    strongEnough: issues.length === 0,
    warnings: result.warnings,
  };
}
