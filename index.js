const express = require('express')
const session = require('express-session');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const util    = require('./app/modules/util')
const glob = require("glob")
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const sizeOf = require('image-size');
const gm = require('gm');
const got = require('got');

const utilsys = require("util");
const readFile = utilsys.promisify(fs.readFile);
const writeFile = utilsys.promisify(fs.writeFile);

const stream = require("stream");
const pipeline = utilsys.promisify(stream.pipeline);




const { S3Client, PutObjectCommand, ListObjectsCommand } = require("@aws-sdk/client-s3");
const {fromIni} = require("@aws-sdk/credential-provider-ini");
const s3 = new S3Client({ 
	credentials: fromIni({profile: 'semlab'}),
	region: 'us-east-1'
});












const app = express()

const port = 7000
const path = require('path');
const htmlFolder = path.join(__dirname, 'app/html');


app.use(express.static('app'))
app.use(fileUpload({ safeFileNames: true, preserveExtension: true }));

app.use(session({
  secret: 'My suureqqet',
  resave: true,
  saveUninitialized: true
}));


// app.use(passport.initialize());
// app.use(passport.session());
app.set('view engine', 'ejs');
app.set('views', './app/html/');
app.use(bodyParser.urlencoded({limit: '200mb', extended: true}));
// app.use( bodyParser.json() );
app.use(express.json({limit: '200mb', extended: true}));







app.post('/', function(req, res) {

	req.session.hasSession = true

	if (req.body.dontuse){
		req.session.wbDontUse = true
		res.render('index',{error:false,wbVerified:req.session.wbVerified, wbDontUse:req.session.wbDontUse})
		return true
	}


	// try loging into wb
	let generalConfig = {
	  instance: 'https://base.semlab.io/',
	  credentials: {
	    username: req.body.username,
	    password: req.body.password
	  }
	}


	let wbEdit = require('wikibase-edit')(generalConfig)

		wbEdit.alias.add({
			id: 'Q21191',
			language: 'fr',
			value: 'test'
		}).then(()=>{

			req.session.wbpw = req.body.password
			req.session.wbus = req.body.username
			req.session.wbVerified = true

			//res.render('index',{error:false, wbVerified:req.session.wbVerified, wbDontUse:req.session.wbDontUse})
			res.redirect(`/work`);


		}).catch((error)=>{

			console.log(error.message)

			res.render('index',{error:error.message, wbVerified:req.session.wbVerified, wbDontUse:req.session.wbDontUse})

		})



});



app.get('/', async function(req, res) {


	req.session.hasSession = true
	if (!req.session.wbVerified){
		req.session.wbVerified = false		
	}

	if (!req.session.wbDontUse){
		req.session.wbDontUse = false
	}

	// console.log(req.user)
	// console.log(req.isAuthenticated())
    // res.sendFile(path.join(htmlFolder, 'index.html'));
    // res.render('index',{isAuthenticated: req.isAuthenticated(), user:req.user})
    res.render('index',{error:false,wbVerified:req.session.wbVerified, wbDontUse:req.session.wbDontUse})
});

app.get('/work', function(req, res) {

	req.session.hasSession = true
	if (!req.session.wbVerified){
		req.session.wbVerified = false		
	}

	if (!req.session.wbDontUse){
		req.session.wbDontUse = false
	}

  	res.render('work',{wbVerified:req.session.wbVerified, wbDontUse:req.session.wbDontUse})
});



app.get('/getcrop', function(req, res) {

		req.session.hasSession = true
		if (!req.session.wbVerified){
			req.session.wbVerified = false		
		}

		if (!req.session.wbVerified){
			return res.status(500).send('Not logged in');
		}

		let filename = '/tmp_data/tmp_crop'+req.session.wbus


    res.setHeader("content-type", "image/jpeg");
    fs.createReadStream(filename).pipe(res);

})



app.post('/savecrop', async function (req, res) {


	req.session.hasSession = true
	if (!req.session.wbVerified){
		req.session.wbVerified = false		
	}

	if (!req.session.wbVerified){
		return res.status(500).send('Not logged in');
	}

	console.log(req.body.item)
	console.log(req.body.P82)
	console.log(req.body.P114)

	let generalConfig = {
	  instance: 'https://base.semlab.io/',
	  credentials: {
	    username: req.session.wbus,
	    password: req.session.wbpw
	  }
	}



	let wbEdit = require('wikibase-edit')(generalConfig);

	let ref = {}
	let qualifiers = {}


	if (req.body.P82 && req.body.P82.trim != ''){
		ref.P82 = { text: req.body.P82, language: 'en' } 
	}

	if (req.body.P114 && req.body.P114.trim != ''){
		ref.P114 = req.body.P114
	}
	if (req.body.P136 && req.body.P136.trim != ''){
		qualifiers.P136 = req.body.P136
	}
	if (req.body.P142 && req.body.P142.trim != ''){
		qualifiers.P142 = req.body.P142
	}


	let log = ""


	let filename = '/tmp_data/tmp_crop'+req.session.wbus


	try{

	  let body = await readFile(filename);

		let input = {
		   Bucket: 'semlab',
		   Key: `images/${req.body.item.qid}.jpg`,
		   Body: body,
		   ContentType: 'image/jpeg'
		}

		const command = new PutObjectCommand(input);
		const response = await s3.send(command);


		log = log + 'Uploaded Image. '

	}catch(err){
		console.log(err)
		return res.status(500).send('Error uploading to S3:' + err);

	}


	try{

		let r = await wbEdit.claim.create({
		  id: req.body.item.qid,
		  property: 'P3',
		  value: `https://semlab.s3.amazonaws.com/images/${req.body.item.qid}.jpg`,
		  references: [
		    ref
		  ],
		  qualifiers: qualifiers
		})






		log = log + 'Added Claim to Wikibase.'

	}catch(err){
		console.log(err)
		return res.status(500).send('Error saving to Wikibase:' + err);

	}

	
	return res.status(200).send(log);


});



app.post('/startcrop', async function (req, res) {


	req.session.hasSession = true
	if (!req.session.wbVerified){
		req.session.wbVerified = false		
	}

	if (!req.session.wbVerified){
		return res.status(500).send('Not logged in');
	}




	let urlToUse = req.body.url

	// let ext = urlToUse.split('.').splice(-1)
	let ext = 'jpg'

	console.log("ExT:",ext)
	console.log("urlToUse",urlToUse)
	let filename = '/tmp_data/tmp_crop'+req.session.wbus

	// https://semlab.s3.amazonaws.com/images/hosted/Alfons_Schilling_1961.jpg
	try {
		await pipeline(
			got.stream(urlToUse),
			fs.createWriteStream(filename)
		);

		gm(filename)
		.resize(1000, 1000)
		.write(filename, function (err) {
	    if (err)
	      return res.status(500).send(err);

	    return res.status(200).send('ok');
		});

		

	} catch (error) {
		console.log('error:', error);


		return res.status(500).send('ERROR ' + error);
	}



	
			
});



app.post('/makecrop', async function (req, res) {


	req.session.hasSession = true
	if (!req.session.wbVerified){
		req.session.wbVerified = false		
	}

	if (!req.session.wbVerified){
		return res.status(500).send('Not logged in');
	}

	var buf = Buffer.from(req.body.crop, 'base64');

	let filename = '/tmp_data/tmp_crop'+req.session.wbus

	await writeFile(filename, buf, 'binary')

	gm(filename)
	.resize(200, 200)
	.write(filename, function (err) {
	  if (err){
	  	res.status(500).send('error cropping ' + err);
	  }else{
	  	return res.status(200).send('ok');	
	  }
	})

});








app.get('/image/:id', function(req, res) {

	let id = req.params.id
	if (id.length!=36){
		res.status(500).send('Bad ID?');
		return
	}
	if (id.split('-').length != 5){
		res.status(500).send('Bad ID?');
		return
	}


	res.sendFile('/tmp_data/' +id );
});

app.get('/entity/:qid', async function(req, res) {

	let data = await util.returnEntity(req.params.qid)
	
	res.json(data);

});



app.get('/work/:id', function(req, res) {
	// console.log(req.user)
	// console.log(req.isAuthenticated())
    // res.sendFile(path.join(htmlFolder, 'index.html'));
    // res.render('index',{isAuthenticated: req.isAuthenticated(), user:req.user})
    
    
    res.render('work',{id:req.params.id})
});





app.post('/upload', async function(req, res) {


	req.session.hasSession = true
	if (!req.session.wbVerified){
		req.session.wbVerified = false		
	}


	if (!req.session.wbVerified){
		return res.status(500).send('Not logged in');
	}




  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send('No files were uploaded.');
  }

  // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
  let sampleFile = req.files.resume;
  console.log(req.files.resume.name)
  console.log("qid=",req.query.qid)

  let id = uuidv4()
  let filename = '/tmp_data/'+req.session.wbus

  // Use the mv() method to place the file somewhere on your server
  sampleFile.mv(filename, async function(err) {
    if (err)
      return res.status(500).send(err);

    let body = await readFile(filename);

		let input = {
		   Bucket: 'semlab',
		   Key: `images/hosted/${req.files.resume.name}`,
		   Body: body,
		   ContentType: 'image/jpeg'
		}

		const command = new PutObjectCommand(input);
		const response = await s3.send(command);



		// gm(filename)
		// .resize(1000, 1000)
		// .write(`${filename}_resized`, function (err) {
	 //    if (err)
	 //      return res.status(500).send(err);


		// });

		res.redirect(`/work?uploaded#${req.query.qid}`);




    
  });
});




app.get('/hostedlist', async function(req, res) {


	req.session.hasSession = true
	if (!req.session.wbVerified){
		req.session.wbVerified = false		
	}


	if (!req.session.wbVerified){
		return res.status(500).send('Not logged in');
	}


	const command = new ListObjectsCommand({
	    Bucket: 'semlab',	    
	    Delimiter: '/',
	    Prefix: 'images/hosted/'
	});
	const response = await s3.send(command);
	let s = response.Contents.sort(function(a,b){return a.LastModified < b.LastModified ? 1 : a.LastModified > b.LastModified ? -1 : 0 })
	res.json(s);



});










app.get('/projects',  function (req, res) {

	let plist = {};
	(async () => {		
		plist = await util.returnProjects()
	})().then(()=>{

		res.json(plist);
	});
	
})


app.get('/plist',  function (req, res) {

	let plist = {};
	(async () => {		
		plist = await util.returnPlist()
	})().then(()=>{

		res.json(plist);
	});
	
})



app.get('/clist',  function (req, res) {


	let clist = {};
	(async () => {		
		clist = await util.returnClasses()
	})().then(()=>{

		res.json(clist);
	});




	
})







app.listen(port, () => console.log(`Example app listening on port ${port}!`))
