const passport = require('passport');
const crypto = require('crypto');
const User = require('../models/User');
const promisify = require('es6-promisify');
const mail = require('../handlers/mail');

exports.login = passport.authenticate('local', {
    failureRedirect: '/login',
    failureFlash: 'Failed Login!',
    successRedirect: '/',
    successFlash: 'You are now logged in!',
});

exports.logout = (req, res) => {
    req.logout();
    req.flash('success', 'You are now logged out! 👋');
    res.redirect('/');
};

exports.isLoggedIn = (req, res, next) => {
    // first check if the user is authenticated
    if (req.isAuthenticated()) {
        next(); // carry on! They are logged in!
        return;
    }
    req.flash('error', 'Oops you must be logged in to do that!');
    res.redirect('/login');
};

exports.forgot = async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
        req.flash('error', 'Email Incorrect');
        return res.redirect('/login');
    }
    user.resetPasswordToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordExpires = Date.now() + 3600000;

    await user.save();

    const resetURL = `http://${req.headers.host}/account/reset/${user.resetPasswordToken}`;
    await mail.send({
        user,
        subject: 'Password Reset Link',
        resetURL,
        filename: 'password-reset',
    });
    req.flash('success', 'You have been emailed a password reset link');

    res.redirect('/login');
};

exports.reset = async (req, res) => {
    const user = await User.findOne({
        resetPasswordToken: req.params.token,
        resetPasswordExpires: { $gt: Date.now() },
    });
    //Token Wrong or Expired
    if (!user) {
        req.flash('error', 'Password reset token is invalid or expired');
        return res.redirect('/login');
    }
    res.render('reset', { title: 'Reset Your Password' });
};

exports.confirmedPasswords = async (req, res, next) => {
    if (req.body.password === req.body['password']) {
        next();
        return;
    }
    req.flash('error', 'Passwords do not match.');
    res.redirect('back');
};

exports.update = async (req, res) => {
    const user = await User.findOne({
        resetPasswordToken: req.params.token,
        resetPasswordExpires: { $gt: Date.now() },
    });
    if (!user) {
        req.flash('error', 'Password reset token is invalid or expired');
        return res.redirect('/login');
    }

    const setPassword = promisify(user.setPassword, user);
    await setPassword(req.body.password);

    // setting them to undefined will remove the fields completely from the user
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    // Actually apply the changes to the user
    const updatedUser = await user.save();
    // Passport js, just pass it a user and you can log it in
    await req.login(updatedUser);
    req.flash('success', 'Password has been reset, you are now logged in!');
    res.redirect('/');
};
