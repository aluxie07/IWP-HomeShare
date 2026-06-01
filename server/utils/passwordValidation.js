const PASSWORD_MESSAGE =
    "Password must be at least 8 characters and include a number.";

function isValidPassword(password) {
    return password && password.length >= 8 && /\d/.test(password);
}

module.exports = { isValidPassword, PASSWORD_MESSAGE };
