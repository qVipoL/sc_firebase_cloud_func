const { db } = require("../util/admin");

/*
Gets all the posts from the database and returns them to the user
*/
exports.getAllPosts = (req, res) =>{
    db.collection('posts').orderBy('createdAt', 'desc').get()
    .then(data => {
        let posts = [];
        data.forEach(doc => {
            posts.push({
                postId: doc.id,
                body: doc.data().body,
                userHandle: doc.data().userHandle,
                createdAt: doc.data().createdAt,
                userImage: doc.data().userImage,
                likeCount: doc.data().likeCount,
                commentCount: doc.data().commentCount
            });
        });
        return res.json(posts);
    })
    .catch(err => {
        console.error(err);
        return res.status(500).json({error: err.code});
    });
}
/*
Creates a post and saves is to the database.
The post contains: {
    body: the input from the user,
    createdAt: timestamp,
    userHandle: username,
    userImage: url to the users image,
    likeCount: amount of likes on the post,
    commentCount: amount of coments on the post
}
*/
exports.postOnePost = (req,res) => {
    if(req.body.body.trim() === '')
        return res.status(400).json({error: 'must no be empty'});

    const newPost = {
        body: req.body.body,
        userHandle: req.user.handle,
        createdAt: new Date().toISOString(),
        userImage: req.user.imageUrl,
        likeCount: 0,
        commentCount: 0
    };
    db.collection('posts').add(newPost)
    .then(doc => {
        const resPost = newPost;
        resPost.postId = doc.id;
        return res.json({resPost});
    })
    .catch(err => {
        console.error(err);
        return res.status(500).json({error: err.code});
    });
}
/*
Gets The post object.
the object contains: {
    postinfo: all of the post info,
    comments: array of objects with from the comments colletion
}
*/
exports.getPost = (req,res) => {
    let postData = {};
    db.doc(`/posts/${req.params.postId}`).get()
    .then(doc => {
        if(!doc.exists){
            return res.status(404).json({error: 'post not found'});
        }
        postData = doc.data();
        postData.postId = doc.id;
        return db.collection('comments')
        .orderBy('createdAt', 'desc')
        .where('postId','==',req.params.postId).get();
    })
    .then(data => {
        postData.comments = [];
        data.forEach(doc => {
            postData.comments.push(doc.data());
        });
        return res.json(postData);
    })
    .catch(err => {
        console.error(err);
        return res.status(500).json({error: err.code});
    });
}
/*
Adds comment object to the database.
The object contains: {
    body: the comment itself,
    postId: id of the liked post,
    userHandle: username of the user who liked it,
    createdAt: timestamp
} 
*/
exports.commentOnPost = (req,res) => {
    if(req.body.body.trim() === '')
        return res.status(400).json({comment: 'must no be empty'});

    const newComment = {
        body: req.body.body,
        userHandle: req.user.handle,
        createdAt: new Date().toISOString(),
        postId: req.params.postId,
        userImage: req.user.imageUrl
    }

    db.doc(`/posts/${req.params.postId}`).get()
    .then(doc => {
        if(!doc.exists)
            return res.status(400).json({error: 'comment not found'});
        return doc.ref.update({commentCount: doc.data().commentCount + 1});
    })
    .then(() => {
        return db.collection('comments').add(newComment);
    })
    .then(() => {
        return res.json(newComment);
    })
    .catch(err => {
        console.error(err);
        return res.status(500).json({error: 'Something went wrong'});
    });   
}
/*
Adds like object to the database.
The object contains: {
    postId: id of the liked post,
    userHandle: username of the user who liked it
}
*/
exports.likePost = (req,res) => {
    const likeDocumnet = db.collection('likes').where('userHandle','==',req.user.handle)
    .where('postId','==',req.params.postId).limit(1);

    const postDocument = db.doc(`/posts/${req.params.postId}`);

    let postData;

    postDocument.get()
    .then(doc => {
        if(!doc.exists)
            return res.status(404).json({error: 'post not found'});
        
        postData = doc.data();
        postData.postId = doc.id;
        return likeDocumnet.get()
    })
    .then(data => {
        if(data.empty){
            return db.collection('likes').add({
                postId: req.params.postId,
                userHandle: req.user.handle
            })
            .then(() => {
                postData.likeCount++;
                return postDocument.update({ likeCount: postData.likeCount });
            })
            .then(() => {
                return res.json(postData);
            })
        } else{
            return res.status(400).json({error: 'post already liked'})
        }
    })
    .catch(err => {
        console.error(err);
        return res.status(500).json({error: err.code});
    });
}
/*
Remove the like object from the database
*/
exports.unlikePost = (req,res) => {
    const likeDocumnet = db.collection('likes').where('userHandle','==',req.user.handle)
    .where('postId','==',req.params.postId).limit(1);

    const postDocument = db.doc(`/posts/${req.params.postId}`);

    let postData;

    postDocument.get()
    .then(doc => {
        if(!doc.exists)
            return res.status(404).json({error: 'post not found'});
        
        postData = doc.data();
        postData.postId = doc.id;
        return likeDocumnet.get()
    })
    .then(data => {
        if(data.empty){
            return res.status(400).json({error: 'post not liked'});
        } else{
            db.doc(`/likes/${data.docs[0].id}`).delete()
            .then(() => {
                postData.likeCount--;
                return postDocument.update({ likeCount: postData.likeCount });
            })
            .then(() => {
                return res.json(postData);
            })
        }
    })
    .catch(err => {
        console.error(err);
        return res.status(500).json({error: err.code});
    });
}
/*
Deletes post, his like and his comments from the database
*/
exports.postDelete = (req,res) => {
    const postDocument = db.doc(`/posts/${req.params.postId}`);
    postDocument.get()
    .then(doc => {
        if(!doc.exists)
            return res.status(400).json({error: 'post not found'});
        if(doc.data().userHandle !== req.user.handle){
            return res.status(403).json({error: 'Unauthorized'});
        } else {
            return postDocument.delete();
        }
    })
    .then(() => {
        res.json({ message: 'Post deleted successfully' });
    })
    .catch(err => {
        console.error(err);
        return res.status(500).json({error: err.code});
    });
}