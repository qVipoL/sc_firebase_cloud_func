const { admin, db } = require('../util/admin');
const firebase = require('firebase');
const firebaseConfig = require('../util/fireBaseConfig');
const { validateSignupData, validateLoginData, reduceUserDetails } = require('../util/validations');

firebase.initializeApp(firebaseConfig);

/*
Adds the user to the database.
Takes object the contains: {
    "email": the email,
    "password": the password,
    "confirmPassword": confirmation of the password,
    "handle": username
}
And saves it to the Auth-system and to the 'users' collection.
Returns a token
*/
exports.userSignUp = (req,res) => {
    const newUser = {
        email: req.body.email,
        password: req.body.password,
        confirmPassword: req.body.confirmPassword,
        handle: req.body.handle
    };

    const { valid, errors } = validateSignupData(newUser);

    if(!valid) return res.status(400).json(errors);

    let token, userId;
    db.doc(`/users/${newUser.handle}`).get()
    .then(doc => {
        if(doc.exists){
            return res.status(400).json({ handle: 'handle already in use'});
        }
        return firebase.auth().createUserWithEmailAndPassword(newUser.email, newUser.password);
    })
    .then(data => {
        userId = data.user.uid;
        return data.user.getIdToken();
    })
    .then(idToken => {
        token = idToken;
        const userCredentials = {
            handle: newUser.handle,
            email: newUser.email,
            createdAt: new Date().toISOString(),
            imageUrl: `https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o/no-img.png?alt=media`,
            userId
        }
        return db.doc(`/users/${newUser.handle}`).set(userCredentials);
    })
    .then(() => {
        return res.status(201).json({ token });
    })
    .catch(err => {
        console.error(err);
        if(err.code === "auth/email-already-in-use"){
            return res.status(400).json({ email: 'email already in use'});
        }
        return res.status(500).json({ general: 'something went wrong, please try again' });
    });
}

/*
Logs the user into the Auth system and returns a token.
Takes object that contains: {
    "email": email of the user,
    "password": the password
}
*/
exports.userLogIn = (req,res) => {
    const user = {
        email: req.body.email,
        password: req.body.password
    }

    const { valid, errors } = validateLoginData(user);

    if(!valid) return res.status(400).json(errors);

    firebase.auth().signInWithEmailAndPassword(user.email, user.password)
    .then(data => {
        return data.user.getIdToken();
    })
    .then(token => {
        return res.json({token});
    })
    .catch(err => {
        console.error(err);
        return res.status(403).json({general: 'wrong credantials, please try again'});
    });
}

/*
Add user details to the 'user' collection in the database.
Takes object that contains: {
    bio: info about the user,
    website: a link the the users website,
    location: users location
}
Every value is optional
*/
exports.addUserDetails = (req,res) => {
    let userDetails = reduceUserDetails(req.body);

    db.doc(`/users/${req.user.handle}`).update(userDetails)
    .then(() => {
        return res.json({ message: 'Details added successfully'});
    })
    .catch(err => {
        console.error(err);
        return res.status(500).json({error: err.code});
    });
};

/*
Gets current user info from the 'users' collection in the database.
And the users likes from 'likes' collection.
*/
exports.getAuthenticatedUser = (req,res) => {
    let userData = {};
    db.doc(`/users/${req.user.handle}`).get()
    .then(doc => {
        if(doc.exists){
            userData.credentials = doc.data();
            return db.collection('likes').where('userHandle','==',req.user.handle).get();
        }
    })
    .then(data => {
        userData.likes = [];
        data.forEach(doc => {
            userData.likes.push(doc.data());
        })
        return db.collection('notifications').where('recipient','==',req.user.handle)
        .orderBy('createdAt', 'desc').limit(10).get();
    })
    .then(data => {
        userData.notifications = [];
        data.forEach(doc => {
            userData.notifications.push({
                recipient: doc.data().recipient,
                sender: doc.data().sender,
                createdAt: doc.data().createdAt,
                postId: doc.data().postId,
                type: doc.data().type,
                read: doc.data().read,
                notificationId: doc.id
            });
        });
        return res.json(userData);
    })
    .catch(err => {
        console.error(err);
        return res.status(500).json({error: err.code});
    });
};

/*
Changes the imageUrl value of the user object in the 'users' collection.
Takes an image as input
*/
exports.uploadImage = (req,res) => {
    const BusBoy = require('busboy');
    const path = require('path');
    const os = require('os');
    const fs = require('fs');

    const busboy = new BusBoy({ headers: req.headers});

    let imageFileName;
    let imageToBeUploaded = {};

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {

        if(mimetype !== 'image/jpeg' && mimetype !== 'image/png'){
            return res.status(400).json({error: 'wrong file type'});
        }

        const imageExtension = filename.split('.')[filename.split('.').length - 1];

        imageFileName = `${Math.round(Math.random()*100000000000)}.${imageExtension}`;
        const filepath = path.join(os.tmpdir(), imageFileName);

        imageToBeUploaded = { filepath, mimetype };
        file.pipe(fs.createWriteStream(filepath));
    });

    busboy.on('finish', () => {
        admin.storage().bucket().upload(imageToBeUploaded.filepath, {
            resumable: false,
            metadata: {
                metadata: { contentType: imageToBeUploaded.mimetype }
            }
        })
        .then(() => {
            const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o/${imageFileName}?alt=media`;
            return db.doc(`/users/${req.user.handle}`).update({ imageUrl });
        })
        .then(() => {
            return res.json({ message: 'Image upload successfully'});
        })
        .catch(err => {
            return res.status(500).json({ error: err.code });
        });
    });

    busboy.end(req.rawBody);
}


exports.getUserDetails = (req,res) => {
    let userData = {};
    db.doc(`users/${req.params.handle}`).get()
    .then(doc => {
        if(doc.exists){
            userData.user = doc.data();
            return db.collection('posts').where('userHandle','==',req.params.handle)
            .orderBy('createdAt','desc').get()
            .then(data => {
                userData.posts = [];
                data.forEach(doc => {
                    userData.posts.push({
                        body: doc.data().body,
                        createdAt: doc.data().createdAt,
                        userHandle: doc.data().userHandle,
                        userImage: doc.data().userImage,
                        likeCount: doc.data().likeCount,
                        commentCount: doc.data().commentCount,
                        postId: doc.id
                    })
                });
                return res.json(userData);
            });
        } else{
            return res.status(400).json({error: 'User not found'});
        }
    })
    .catch(err => {
        console.error(err);
        return res.status(500).json({ error: err.code });
    });
}

exports.markNotificationsRead = (req,res) => {
    let batch = db.batch();
    req.body.forEach(notificationId => {
        const notification = db.doc(`/notifications/${notificationId}`);
        batch.update(notification, { read: true});
    });
    batch.commit()
    .then(() => {
        return res.json({message: 'Notifications marked read'});
    })
    .catch(err => {
        console.error(err);
        return res.status(500).json({ error: err.code });
    });
}

exports.deleteNotifications = (req,res) => {
    let batch = db.batch();
    req.body.forEach(notificationId => {
        const notification = db.doc(`/notifications/${notificationId}`);
        batch.delete(notification);
    });
    batch.commit()
    .then(() => {
        return res.json({ message : 'Notifications deleted'})
    })
    .catch(err => {
        console.error(err);
        return res.status(500).json({ error: err.code });
    })
}
