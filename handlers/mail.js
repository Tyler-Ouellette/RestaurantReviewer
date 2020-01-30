const nodeMailer = require('nodemailer');
const pug = require('pug');
const juice = require('juice');
const htmlToText = require('html-to-text');
const promisify = require('es6-promisify');

const transport = nodeMailer.createTransport({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
    },
});

const generateHTML = (filename, options = {}) => {
    const html = pug.renderFile(`${__dirname}/../views/email/${filename}.pug`, options);
    const inline = juice(html);
    return inline;
};

exports.send = async options => {
    const mailOptions = {
        from: 'Restaurant Review <ouell117@uwindsor.ca>',
        to: options.user.email,
        subject: options.subject,
        html,
        text,
    };
    const html = generateHTML(options.filename, mailOptions);
    const text = htmlToText.fromString(html);

    const sendMail = promisify(transport.sendMail, transport);
    return sendMail(mailOptions);
};
