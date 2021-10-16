import * as express from 'express';
import {Request,Response} from 'express';
import * as cors from 'cors';
// import "reflect-metadata";
import { createConnection} from 'typeorm';
import {Product} from './entity/product';
import * as amqp from 'amqplib/callback_api';

require('dotenv').config();

createConnection().then(db => {
    
    amqp.connect(process.env.AMPQ_URL,(err,conn)=>{
        if(err){
            throw err;
        }
        conn.createChannel((error,channel)=>{
            if(error) throw error;
            
            const app = express();
            const PORT = process.env.PORT ;

            app.use(cors({
                origin:['http://localhost:3000','http://localhost:4200']
            }));
            app.use(express.json());
        
            const productData =  db.getRepository(Product);
            app.get('/api/products',async(req:Request,res:Response)=>{
                const products = await productData.find();
                return res.json(products);
            });
        
        
            app.post('/api/products', async(req:Request,res:Response)=>{
                const product = await productData.create(req.body);
                const result  = await productData.save(product);
                channel.sendToQueue(process.env.AMPQ_QUEUE_C,Buffer.from(JSON.stringify(result)));
                return res.json(result);
            });
        
            app.get('/api/products/:id',async(req:Request,res:Response)=>{
                console.log("id " , req.params.id);
                const product = await productData.findOne(req.params.id);
                return res.json(product);
            });
        
            app.put('/api/products/:id',async(req:Request,res:Response)=>{
                const product = await productData.findOne(req.params.id);
                productData.merge(product,req.body);
                const result = await productData.save(product);
                channel.sendToQueue(process.env.AMPQ_QUEUE_U,Buffer.from(JSON.stringify(result)));
                return res.send(result);
            });
        
            app.delete('/api/products/:id',async(req:Request,res:Response)=>{
                const result = await productData.delete(req.params.id);
                channel.sendToQueue(process.env.AMPQ_QUEUE_D,Buffer.from(req.params.id));
                return res.send(result);
            });
        
            app.post('/api/products/:id/like',async(req:Request,res:Response)=>{
                const product = await productData.findOne(req.params.id);
                product.likes++;
                const result = productData.save(product);
                return res.send(result);
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
});
    
