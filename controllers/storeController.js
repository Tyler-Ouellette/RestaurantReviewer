const mongoose = require('mongoose');
const Store = mongoose.model('Store');
const User = mongoose.model('User');
const multer = require('multer');
const jimp = require('jimp');
const uuid = require('uuid');
const multerOptions = {
    // just keep it in local memory as we don't want the original photo. We will resize it and then save that photo
    storage: multer.memoryStorage(),
    fileFilter(req, file, next) {
        const isPhoto = file.mimetype.startsWith('image/');
        if (isPhoto) {
            // If you pass something as the first value in next, it is an error, see below
            // We pass null so there is no error, and the second value is what needs to be passed
            next(null, true);
        } else {
            next({ message: 'That file type is not allowed.' }, false);
        }
    },
};

exports.homePage = (req, res) => {
    res.render('index');
};

exports.addStore = (req, res) => {
    res.render('editStore', { title: 'Add Store' });
};

exports.upload = multer(multerOptions).single('photo');

exports.resize = async (req, res, next) => {
    if (!req.file) return next(); //if no file to upload, just skip down
    const extension = req.file.mimetype.split('/')[1];
    req.body.photo = `${uuid.v4()}.${extension}`;

    const photo = await jimp.read(req.file.buffer);
    await photo.resize(800, jimp.AUTO);
    await photo.write(`./public/uploads/${req.body.photo}`);
    //once written the photo to our file system, keep going
    next();
};

exports.createStore = async (req, res) => {
    req.body.author = req.user._id;
    const store = await new Store(req.body).save();
    req.flash('success', `Successfully Created ${store.name}. Care to leave a review?`);
    res.redirect(`/store/${store.slug}`);
};

exports.getStores = async (req, res) => {
    const page = req.params.page || 1;
    const limit = 6;
    const skip = page * limit - limit;

    if (req.user) {
        const ownedPromise = Store.find({ author: req.user._id });
        const countPromise = Store.countDocuments();
        const storesPromise = Store.find()
            .skip(skip)
            .limit(limit)
            .sort({ created: 'desc' });

        const [owned, count, stores] = await Promise.all([ownedPromise, countPromise, storesPromise]);

        const pages = Math.ceil(count / limit);
        if (!stores.length && skip) {
            req.flash(
                'info',
                `You asked for page ${page}, but that doesn't exist. So I put you on page ${pages}, the last page`
            );
            res.redirect(`/stores/page/${pages}`);
        }
        res.render('stores', { title: 'Stores', stores, owned, page, pages });
        return;
    }
    const countPromise = Store.count();
    const storesPromise = Store.find()
        .skip(skip)
        .limit(limit)
        .sort({ created: 'desc' });

    const [count, stores] = await Promise.all([countPromise, storesPromise]);

    const pages = Math.ceil(count / limit);
    if (!stores.length && skip) {
        req.flash(
            'info',
            `You asked for page ${page}, but that doesn't exist. So I put you on page ${pages}, the last page`
        );
        res.redirect(`/stores/page/${pages}`);
        return;
    }
    res.render('stores', { title: 'Stores', stores, page, pages });
};

const confirmOwner = (store, user) => {
    if (!store.author.equals(user._id)) {
        res.flash('error', 'You must own a store in order to edit it!');
        res.redirect('/');
    }
};

exports.editStore = async (req, res) => {
    const store = await Store.findOne({ _id: req.params.id });

    confirmOwner(store, req.user);
    res.render('editStore', { title: `Edit ${store.name}`, store });
};

exports.updateStore = async (req, res) => {
    //set the location data to be a point
    req.body.location.type = 'Point';
    // find and update the store
    const store = await Store.findOneAndUpdate({ _id: req.params.id }, req.body, {
        new: true, // return the new store instead of the old one
        runValidators: true,
    }).exec(); //add the .exec at the end to ensure findOneAndUpdate runs
    req.flash(
        'success',
        `Successfully updated <strong>${store.name}</strong>. <a href="/store/${store.slug}">View Store →</a>`
    );
    res.redirect(`/stores/${store._id}/edit`);
};

exports.getStoreBySlug = async (req, res, next) => {
    // Populate will give the entire object of the ref of the Id that author has
    const store = await (await Store.findOne({ slug: req.params.slug })).populate('author reviews');
    if (!store) return next();
    res.render('store', { store, title: store.name });
};

exports.getStoresByTag = async (req, res) => {
    const tag = req.params.tag;
    const tagQuery = tag || { $exists: true, $ne: [] };
    const tagsPromise = Store.getTagsList();
    const storesPromise = Store.find({ tags: tagQuery });

    const [tags, stores] = await Promise.all([tagsPromise, storesPromise]);

    res.render('tag', { tags, title: 'Tags', tag, stores });
};

exports.searchStores = async (req, res) => {
    const stores = await Store.find(
        {
            // Because we made a compound index, and they are both considered text. We can use a text search that will check any index that is identified as text using $text
            //https://docs.mongodb.com/manual/reference/operator/query/text/
            $text: {
                $search: req.query.q,
            },
        },
        {
            // Second Parameter is Projection meaning add a field
            // https://docs.mongodb.com/manual/reference/operator/projection/meta/
            score: { $meta: 'textScore' },
        }
    )
        .sort({
            score: { $meta: 'textScore' },
        })
        .limit(10);
    res.json(stores);
};

exports.mapStores = async (req, res) => {
    const coordinates = [req.query.lng, req.query.lat].map(parseFloat);
    const q = {
        location: {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates,
                },
                $maxDistance: 10000, // 10km
            },
        },
    };

    const stores = await Store.find(q)
        .select('slug name description location photo')
        .limit(10);
    res.json(stores);
};

exports.mapPage = (req, res) => {
    res.render('map', { title: 'Map' });
};

exports.likeStore = async (req, res) => {
    // MongoDb overwrites the toString function on each object which allows us to get a list of posible strings
    const hearts = req.user.hearts.map(obj => obj.toString());
    //$pull is the mongoDb operator to remove from. $addToSet will ensure it is unique, and won't add it twice
    const operator = hearts.includes(req.params.id) ? '$pull' : '$addToSet';
    // Since we have either pull or add to set in a variable, we use Computed property names from es6 using [] to replace itself with whatever the variable will be.accordion-heading
    const user = await User.findByIdAndUpdate(req.user.id, { [operator]: { hearts: req.params.id } }, { new: true });
    res.json(user);
};

exports.getLikes = async (req, res) => {
    // This will find any stores where the id is in the array req.user.hearts
    const stores = await Store.find({
        _id: { $in: req.user.hearts },
    });
    res.render('stores', { title: 'Liked Stores', stores });
};

exports.getTopStores = async (req, res) => {
    const stores = await Store.getTopStores();
    res.render('topStores', { stores, title: '⭐Top Stores!' });
};
