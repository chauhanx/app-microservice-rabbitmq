import * as express from 'express';
import {Request,Response} from 'express';
import * as cors from 'cors';
import { createConnection} from 'typeorm';
require('dotenv').config();
import * as amqp from 'amqplib/callback_api';
import { Product } from './entity/product';
import axios from 'axios';

createConnection().then(db => {
    
    amqp.connect(process.env.AMPQ_URL,(err,conn)=>{
        if(err){
            throw err;
        }
        const ProductData = db.getMongoRepository(Product);

        conn.createChannel((error,channel)=>{
            if(error) throw error;

            channel.assertQueue(process.env.AMPQ_QUEUE_C,{durable:false});
            channel.assertQueue(process.env.AMPQ_QUEUE_U,{durable:false});
            channel.assertQueue(process.env.AMPQ_QUEUE_D,{durable:false});
            
            const app = express();
            const PORT = process.env.PORT;
            app.use(cors({
                origin:['http://localhost:3000','http://localhost:4200']
            }));
            app.use(express.json());
            channel.consume(process.env.AMPQ_QUEUE_C,async(msg)=>{
                const eventProduct:Product = JSON.parse(msg.content.toString());
                const product = new Product();
                product.admin_id = parseInt(eventProduct.id);
                product.title = eventProduct.title;
                product.image = eventProduct.image;
                product.likes = eventProduct.likes;

                await ProductData.save(product);
                console.log("Product created");
                
            },{noAck:true});

            channel.consume(process.env.AMPQ_QUEUE_U,async(msg)=>{
                const eventProduct:Product = JSON.parse(msg.content.toString());
                const product = await ProductData.findOne({admin_id:parseInt(eventProduct.id)});
                ProductData.merge(product,{
                    title : eventProduct.title,
                    image : eventProduct.image,
                    likes : eventProduct.likes
                })
                await ProductData.save(product);
                console.log("Product updated");
                
            },{noAck:true});

            channel.consume(process.env.AMPQ_QUEUE_D,async(msg)=>{
                const admin_id = parseInt(msg.content.toString());
                await ProductData.deleteOne({admin_id});
                console.log("Product deleted");
            });
        
            app.get('/api/products',async(req:Request,res:Response)=>{
                const products = await ProductData.find();
                return res.send(products);
            });

            app.get('/api/products/:id/likes',async(req:Request,res:Response)=>{
                const product = await ProductData.findOne(req.params.id);
                await axios.post(`http://localhost:8000/api/products/${product.admin_id}`,{});
                product.likes++;
                await ProductData.save(product);
                return res.send(product);
            });

            // console.log(`Listening to port ${PORT}`);
            app.listen(PORT);

            process.on('beforeExit',()=>{
                conn.close();
            });

        })
    });
    

})
.catch(err => {
    console.log("*******************db error******************");
    console.log(err);
})
