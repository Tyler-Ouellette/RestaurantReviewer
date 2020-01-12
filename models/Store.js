const mongoose = require('mongoose');
mongoose.Promise = global.Promise;
const slug = require('slugs');

const storeSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            trim: true,
            required: 'Please enter a store name!',
        },
        slug: String,
        description: {
            type: String,
            trim: true,
        },
        tags: [String],
        created: {
            type: Date,
            default: Date.now,
        },
        location: {
            type: {
                type: String,
                default: 'Point',
            },
            coordinates: [
                {
                    type: Number,
                    required: 'You must supply coordinates!',
                },
            ],
            address: {
                type: String,
                required: 'You must supply an address!',
            },
        },
        photo: String,
        author: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
            required: 'You must supply an author',
        },
    },
    {
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Define our indexes
storeSchema.index({
    name: 'text',
    description: 'text',
});

storeSchema.index({ location: '2dsphere' });

storeSchema.pre('save', async function(next) {
    if (!this.isModified('name')) {
        next(); // skip it
        return; // stop this function from running
    }
    this.slug = slug(this.name);
    // find other stores that have a slug of wes, wes-1, wes-2
    const slugRegEx = new RegExp(`^(${this.slug})((-[0-9]*$)?)$`, 'i');
    const storesWithSlug = await this.constructor.find({ slug: slugRegEx });
    if (storesWithSlug.length) {
        this.slug = `${this.slug}-${storesWithSlug.length + 1}`;
    }
    next();
    // TODO make more resiliant so slugs are unique
});

storeSchema.statics.getTagsList = function() {
    return this.aggregate([
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
    ]);
};

storeSchema.statics.getTopStores = function() {
    return this.aggregate([
        // Lookup stores and populate their reviews
        // the from field is weird. Basically it is the model, but mongoDB will make it lowercase and then add a 'S' on the end so it must be looked up as from: 'reviews' whereas below I had to do ref: 'Review'
        // as: 'reviews' is what we are setting the field name to be in the json data. can be anything you want it to be
        { $lookup: { from: 'reviews', localField: '_id', foreignField: 'store', as: 'reviews' } },

        // Filter for stores that have 2 or more reviews, we don't want to show stores with 1 review
        // reviews.1 is how you access something that is index based in mongodb
        // so we match documents where the "second item in reviews" exists is true. Basically saying array[1] is not null
        { $match: { 'reviews.1': { $exists: true } } },

        // add a field of average reviews
        // project is like adding a field of averageRating. the value is the average of the reviews rating field, and the $ means it is a field from the data being taken in (in this instance from $match above)
        // The problem is, it does not give back all the values, so you need to explicitly say which values you want
        //Depricated *****

        {
            $project: {
                photo: '$$ROOT.photo',
                name: '$$ROOT.name',
                slug: '$$ROOT.slug',
                reviews: '$$ROOT.reviews',
                averageRating: { $avg: '$reviews.rating' },
            },
        },

        //As of mongo 3.4, now we have $addField, however it is not allowed in this atlas tier -.- yay for free tiers
        // //  {
        // //      $addField: {
        // //          averageRating: { $avg: '$reviews.rating' },
        // //      },
        // //  },
        // // sort it by our own field, highest reviews first
        { $sort: { averageRating: -1 } },
        //limit to 10 at most
        { $limit: 10 },
    ]);
};

//kinda like a join in sql but not saving any relationship
// find reviews where the stores _id property === reviews store property
storeSchema.virtual('reviews', {
    ref: 'Review', // what model to link?
    localField: '_id', // which field on the store?
    foreignField: 'store', // which field on the review?
});

function autopopulate(next) {
    this.populate('reviews');
    next();
}

storeSchema.pre('find', autopopulate);
storeSchema.pre('findOne', autopopulate);

module.exports = mongoose.model('Store', storeSchema);
