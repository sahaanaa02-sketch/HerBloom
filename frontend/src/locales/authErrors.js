const knownErrors = new Map([
  ['Incorrect email or password.', 'invalid_credentials'],
  ['Invalid email or password', 'invalid_credentials'],
  ['This account is inactive.', 'account_inactive'],
  ['Account temporarily locked', 'account_locked'],
  ['An account with this email already exists.', 'account_exists'],
  ['Email or username already exists. Please try again.', 'account_exists'],
  ['This link is invalid or has expired.', 'expired_link'],
  ['Invalid verification code.', 'invalid_reset_code'],
  ['Verification code expired.', 'expired_reset_code'],
  ['Cannot connect to the HerBloom server.', 'connection_failed'],
  ['Password and Confirm Password do not match.', 'password_and_confirm_password_do_not_match'],
  ['Passwords do not match.', 'passwords_do_not_match'],
  ['Account email sending is currently disabled.', 'email_unavailable'],
])

export function authErrorKey(message, status) {
  return knownErrors.get(message) ?? (
    status === 422 ? 'invalid_input' :
      status === 429 ? 'account_locked' : 'something_went_wrong_please_try_again'
  )
}
