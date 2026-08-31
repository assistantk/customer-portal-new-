import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: 'shurak949@gmail.com',
        pass: 'alyhypvdbnxxlzre'
    }
});

transporter.verify(function(error, success) {
    if (error) {
        console.error('SMTP Auth Error:', error);
    } else {
        console.log('SMTP Auth Success!');
    }
});
