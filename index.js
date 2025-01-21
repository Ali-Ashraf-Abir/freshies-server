
const express = require('express')

const cors = require('cors');

const stripe = require('stripe')("sk_test_51NH5nOE9cJvXm7FfnONogRljQEx7s2cyjukGBDtIz5GG5eFln03AzelPZvHgbyWJp8MwBe6vQXK3hDJhM9s9WVR200xlhrWniu")

const env=require('dotenv').config('./.env')

const app = express()
const port = process.env.PORT || 5000;

app.use(cors())

app.use(express.json())

console.log(process.env.DB_USER)
const { MongoClient, ServerApiVersion, ObjectId, UUID } = require('mongodb');
const { restart } = require('nodemon');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ravtcpm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    const db = client.db("Freshies");
    const userCollection = db.collection('users');
    const foodCollection = db.collection('foodCollection');

    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    // Watch for changes to the cart array, specifically the `status` field
    const changeStream = userCollection.watch([
      {
        $match: {
          operationType: 'update', // Listen only for update operations
        },
      },
    ]);

    // Listen for changes
    changeStream.on('change', (change) => {
      console.log('Change detected:', change);

      if (change.operationType === 'update') {
        const updatedFields = change.updateDescription.updatedFields;

        // Loop through the updated fields to find changes in the `cart` array
        for (const field in updatedFields) {
          if (field.startsWith('cart.') && field.endsWith('.status')) {
            // Extract index from the field path (e.g., cart.1.status -> index 1)
            const match = field.match(/cart\.(\d+)\.status/);
            const cartIndex = match ? parseInt(match[1], 10) : null;

            if (cartIndex !== null) {
              const newStatus = updatedFields[field];

              console.log(`Status change detected for cart item at index ${cartIndex}:`, newStatus);

              // Trigger your custom function
              myCustomFunction(cartIndex, newStatus, change.documentKey._id);
            }
          }
        }
      }
    });

    // Example function to handle the detected change
    function myCustomFunction(cartIndex, newStatus, userId) {
      console.log(`User ${userId} had a cart status change at index ${cartIndex}:`, newStatus);

      // Add your business logic here
    }

    // Handle errors
    changeStream.on('error', (error) => {
      console.error('Error in Change Stream:', error);
    });

    //  to observe changes in the backend

    app.post("/owners", async (req, res) => {

      const body = req.body;
      const result = await userCollection.insertOne(body)
      res.send()

    })


    app.post('/addimage',async(req,res)=>{

      const body=req.body
      const result=await userCollection.updateOne({_id:new ObjectId(body.userData._id)},
      
      {$set:{
        image:body.image
      }

      })

      res.send(result)
    })



    app.get('/user/:email', async (req, res) => {



      const result = await userCollection.find({ email: req.params.email }).toArray()
      res.send(result)


    })


    app.get('/restaurants', async (req, res) => {



      const result = await userCollection.find({ userType:'Restaurant Owner' }).toArray()
      res.send(result)


    })

    app.post("/addfood", async (req, res) => {

      const body = req.body;
      const result = await foodCollection.insertOne(body)
      res.send()

    })

    app.get('/foods', async (req, res) => {



      const result = await foodCollection.find({}).toArray()
      res.send(result)


    })

    app.delete('/foods/:id', async (req, res) => {

      const id = req.params.id
      const result = await foodCollection.deleteOne({ _id: new ObjectId(id) })

    })

    app.post("/editfood", async (req, res) => {

      const body = req.body;
      const result = await foodCollection.updateOne({ _id: new ObjectId(body.id) }, { $set: body })
      res.send()

    })

    // for adding foods to usercart

    app.post("/cart/:id", async (req, res) => {

      const body = req.body;
      body.UID = new UUID()
      const id = req.params.id
      console.log(body)
      const user = await userCollection.updateOne({ _id: new ObjectId(body.userId) }, {
        $push: {
          cart: body
        },

      })
      // const restaurant=await userCollection.updateOne({businessName:body.restaurant},{
      //   $push:{
      //     orders:body
      //   }
      // })

    })



    app.put("/cartDelete/:id", async (req, res) => {

      const body = req.body;
      const id = req.params.id
      console.log(body)
      const user = await userCollection.updateOne({ _id: new ObjectId(body.userId) }, {
        $pull: { cart: { foodName: id } }
      })
      // const restaurant=await userCollection.updateOne({businessName:body.restaurant},{
      //   $pull:{
      //     orders:{foodName:id}
      //   }
      // })

    })


    app.post("/checkOut", async (req, res) => {

      const { products } = req.body;
      const { userData } = req.body

      const lineItems = products.map((product) => ({
        price_data: {
          currency: "bdt",
          product_data: {
            name: product.foodName,
            images: product.foodImage
          },
          unit_amount: (product.foodPrice * 100)/product.quantity,
        },
        quantity: product.quantity
      }))

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: "payment",
        success_url: "http://localhost:5173/payment/success",
        cancel_url: "http://localhost:5173/"

      })


      res.send({ id: session.id, status: session.payment_status });

    })


    app.post("/paid", async (req, res) => {

      const { userData, restaurant } = req.body
      console.log(req.body)
      const result = await userCollection.updateOne(
        { _id: new ObjectId(userData._id) },
        { $set: { "cart.$[].status": "paid" }, }
      );

      for (let i = 0; i < req.body.products.length; i++) {
        const restaurantOrders = await userCollection.updateOne({ businessName: req.body.products[i].restaurant }, {
          $push: {
            orders: req.body.products[i]
          }
        })
      }

    //   if (Array.isArray(req.body.products)) {
    //     const updatePromises = req.body.products.map(product => {
    //       return userCollection.updateOne(
    //         { businessName: product.restaurant },
    //         { $push: { orders: product } }
    //       );
    //     });

    //     try {
    //       const results = await Promise.all(updatePromises);
    //       console.log("All orders updated successfully:", results);
    //     } catch (error) {
    //       console.error("Error updating orders:", error);
    //     }
    //   } else {
    //     console.error("Invalid input: req.body.products is not an array");
    //   }

    })

    app.post("/statusUpdate", async (req, res) => {

      const body = req.body;
      console.log(body)
      const result =await userCollection.updateOne(
        { 
          _id: new ObjectId(body.order.userId), 
          "cart.UID": new UUID(body.order.UID) 
        },
        { 
          $set: { "cart.$.status": body.status } 
        }
      );
      const result2 =await userCollection.updateOne(
        { 
          businessName: body.order.restaurant, 
          "orders.UID": body.order.UID 
        },
        { 
          $set: { "orders.$.status": body.status } 
        }
      );


    // const result=await userCollection.find({_id:new ObjectId(body.order.userId),"cart.UID":new UUID(body.order.UID)}).toArray()
    // console.log(result)
    })

  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send("simple crud is running")
})


app.listen(port, () => {
  console.log('server is running on port 5000')
})