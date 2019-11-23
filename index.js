const functions = require('firebase-functions');
const express = require('express');
const { getAllPosts, postOnePost, getPost, commentOnPost, likePost, unlikePost, postDelete } = require('./handlers/posts');
const { userSignUp, userLogIn, uploadImage, addUserDetails, getAuthenticatedUser, getUserDetails, markNotificationsRead, deleteNotifications } = require('./handlers/users');
const FBauth = require('./util/fireBaseAuth');
const { db } = require('./util/admin');

const cors = require('cors');
//init app
const app = express();

app.use(cors());

//user routers
app.post('/signup', userSignUp);
app.post('/login', userLogIn);

//upload image
app.post('/user/image', FBauth, uploadImage);
//add user details
app.post('/user', FBauth, addUserDetails);
//get authenticated user data and likes - used in front end
app.get('/user', FBauth, getAuthenticatedUser);
//get other user's data
app.get('/user/:handle', getUserDetails);
//mark a notification as read
app.post('/notifications', FBauth, markNotificationsRead);
//delete notifications
app.post('/notifications/delete', FBauth, deleteNotifications);

////////////////////////////////POSTS
//get and post posts
app.get('/posts', getAllPosts);
app.post('/post', FBauth, postOnePost);

//delete post
app.delete('/post/:postId', FBauth, postDelete);
//get post with comments by id
app.get('/post/:postId', getPost);
//post new comment on post by his id
app.post('/post/:postId/comment', FBauth, commentOnPost);
//like a post
app.get('/post/:postId/like', FBauth, likePost);
//unlike a post
app.get('/post/:postId/unlike', FBauth, unlikePost);
////////////////////////////////POSTS

//404 route
app.use((req,res) => {
    res.status(404).json({error: 'this path does not exsist'});
});

exports.api = functions.region('europe-west1').https.onRequest(app);

exports.createNotificationOnLike = functions
  .region('europe-west1')
  .firestore.document('likes/{id}')
  .onCreate((snapshot) => {
    return db
      .doc(`/posts/${snapshot.data().postId}`)
      .get()
      .then((doc) => {
        if (
          doc.exists &&
          doc.data().userHandle !== snapshot.data().userHandle
        ) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: 'like',
            read: false,
            postId: doc.id
          });
        }
      })
      .catch((err) => console.error(err));
  });

exports.deleteNotificationOnUnLike = functions
  .region('europe-west1')
  .firestore.document('likes/{id}')
  .onDelete((snapshot) => {
    return db
      .doc(`/notifications/${snapshot.id}`)
      .delete()
      .catch((err) => console.error(err))
  });

exports.createNotificationOnComment = functions
  .region('europe-west1')
  .firestore.document('comments/{id}')
  .onCreate((snapshot) => {
    return db
        .doc(`/posts/${snapshot.data().postId}`)
        .get()
        .then((doc) => {
        if (
            doc.exists &&
            doc.data().userHandle !== snapshot.data().userHandle
        ) {
            return db.doc(`/notifications/${snapshot.id}`).set({
                createdAt: new Date().toISOString(),
                recipient: doc.data().userHandle,
                sender: snapshot.data().userHandle,
                type: 'comment',
                read: false,
                postId: doc.id
            });
        }
        })
      .catch((err) => console.error(err));
});

exports.onUserImageChange = functions.region('europe-west1').firestore.document('/users/{userId}')
.onUpdate((change) => {
    if(change.before.data().imageUrl !== change.after.data().imageUrl){
        console.log('image has changed');
        let batch = db.batch();
        return db.collection('posts').where('userHandle','==',change.before.data().handle).get()
        .then((data) => {
            data.forEach(doc => {
                const post = db.doc(`/posts/${doc.id}`);
                batch.update(post, {userImage: change.after.data().imageUrl })
            })
            return batch.commit();
        });
    } else {
        return true;
    }
})

exports.onPostDelete = functions
  .region('europe-west1')
  .firestore.document('/posts/{postId}')
  .onDelete((snapshot, context) => {
    const postId = context.params.postId;
    const batch = db.batch();
    return db
      .collection('comments')
      .where('postId', '==', postId)
      .get()
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/comments/${doc.id}`));
        });
        return db
          .collection('likes')
          .where('postId', '==', postId)
          .get();
      })
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/likes/${doc.id}`));
        });
        return db
          .collection('notifications')
          .where('postId', '==', postId)
          .get();
      })
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/notifications/${doc.id}`));
        });
        return batch.commit();
      })
      .catch((err) => console.error(err));
  });
