import vertexShaderSrc from './vertex.glsl.js';
import fragmentShaderSrc from './fragment.glsl.js'

var gl = null;
var vao = null;
var program = null;
var vertexCount = 0;
var uniformModelViewLoc = null;
var uniformProjectionLoc = null;
var heightmapData = null;
var translate = [0, 0, 0];
var scale = document.getElementById('scale');
var height = document.getElementById('height');
var rotation_slider_x = document.getElementById('rotationx');
var rotation_slider_y = document.getElementById('rotationy');
var rotationx = document.getElementById('rotationx').value;
var rotationy = document.getElementById('rotationy').value;
const fpsElem = document.querySelector("#fps");
let then = 0;

function processImage(img)
{
	// draw the image into an off-screen canvas
	var off = document.createElement('canvas');
	
	var sw = img.width, sh = img.height;
	off.width = sw; off.height = sh;
	
	var ctx = off.getContext('2d');
	ctx.drawImage(img, 0, 0, sw, sh);
	
	// read back the image pixel data
	var imgd = ctx.getImageData(0,0,sw,sh);
	var px = imgd.data;
	
	// create a an array will hold the height value
	var heightArray = new Float32Array(sw * sh);

	// create an array to hold the mesh vertex positions
	var meshVertices = new Float32Array(3 * sw * sh);
	
	// loop through the image, rows then columns
	for (var y=0;y<sh;y++) 
	{
		for (var x=0;x<sw;x++) 
		{
			// offset in the image buffer
			var i = (y*sw + x)*4;
			
			// read the RGB pixel value
			var r = px[i+0], g = px[i+1], b = px[i+2];
			
			// convert to greyscale value between 0 and 1
			var lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255.0;

			// store in array
			heightArray[y*sw + x] = lum;

			// store in mesh vertices
			meshVertices[(y*sw + x)*3 + 0] = 2 * x / sw - 1;
			meshVertices[(y*sw + x)*3 + 1] = 2 * lum - 1;
			meshVertices[(y*sw + x)*3 + 2] = 2 * y / sh - 1;
		}
	}

	return {
		positions: meshVertices,
		data: heightArray,
		width: sw,
		height: sh
	};
}


window.loadImageFile = function(event)
{

	var f = event.target.files && event.target.files[0];
	if (!f) return;
	
	// create a FileReader to read the image file
	var reader = new FileReader();
	reader.onload = function() 
	{
		// create an internal Image object to hold the image into memory
		var img = new Image();
		img.onload = function() 
		{
			// heightmapData is globally defined
			heightmapData = processImage(img);
			
			/*
				TODO: using the data in heightmapData, create a triangle mesh
					heightmapData.data: array holding the actual data, note that 
					this is a single dimensional array the stores 2D data in row-major order

					heightmapData.width: width of map (number of columns)
					heightmapData.height: height of the map (number of rows)
			*/
			console.log('loaded image: ' + heightmapData.width + ' x ' + heightmapData.height);
			// console.log(heightmapData);

			// create buffers to put in mesh
			var meshVertices = [];

			var index_order = [];
			// order vertices to form a quad for every 4 pixel square
			// sliding window of size 2x2
			for (var y = 0; y < heightmapData.height-1; y++)
			{
				for (var x = 0; x < heightmapData.width-1; x++)
				{
					var v00 = y*heightmapData.width + x;
					var v10 = v00 + 1;
					var v01 = v00 + heightmapData.width;
					var v11 = v01 + 1;

					// triangle 1 (ordered counterclockwise)
					index_order.push(v00, v01, v10);
					// triangle 2 (ordered counterclockwise)
					index_order.push(v10, v01, v11);
				}
			}
			// console.log(index_order);

			for (var i = 0; i < index_order.length; i++)
			{
				meshVertices.push(heightmapData.positions[index_order[i]*3 + 0]);
				meshVertices.push(heightmapData.positions[index_order[i]*3 + 1]);
				meshVertices.push(heightmapData.positions[index_order[i]*3 + 2]);
			}

			meshVertices = new Float32Array(meshVertices);
			// console.log(meshVertices);
			vertexCount = meshVertices.length / 3;		// vertexCount is global variable used by draw()

			var posBuffer = createBuffer(gl, gl.ARRAY_BUFFER, meshVertices);

			var vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSrc);
			var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc);
			program = createProgram(gl, vertexShader, fragmentShader);

			// attributes (per vertex)
			var posAttribLoc = gl.getAttribLocation(program, "position");

			// uniforms
			uniformModelViewLoc = gl.getUniformLocation(program, 'modelview');
			uniformProjectionLoc = gl.getUniformLocation(program, 'projection');

			vao = createVAO(gl, 
				// positions
				posAttribLoc, posBuffer, 

				// normals (unused in this assignments)
				null, null, 

				// colors (not needed--computed by shader)
				null, null
			);
		};
		img.onerror = function() 
		{
			console.error("Invalid image file.");
			alert("The selected file could not be loaded as an image.");
		};

		// the source of the image is the data load from the file
		img.src = reader.result;
	};
	reader.readAsDataURL(f);
}


function setupViewMatrix(eye, target)
{
    var forward = normalize(subtract(target, eye));
    var upHint  = [0, 1, 0];

    var right = normalize(cross(forward, upHint));
    var up    = cross(right, forward);

    var view = lookAt(eye, target, up);
    return view;

}
function draw(now)
{
	now *= 0.001;                          // convert to seconds
  	const deltaTime = now - then;          // compute time since last frame
  
	if(projection.value == "orthographic")
	{
		var left = -gl.canvas.clientWidth/200;
		var right = gl.canvas.clientWidth/200;
		var bottom = gl.canvas.clientHeight/200;
		var top = -gl.canvas.clientHeight/200;
		var near = 200;
		var far = -200;

		var projectionMatrix = orthographicMatrix(
			left,
			right,
			bottom,
			top,
			near,
			far,
		);
	}
	else
	{
		var fovRadians = 70 * Math.PI / 180;
		var aspectRatio = gl.canvas.clientWidth / gl.canvas.clientHeight;
		var nearClip = 0.001;
		var farClip = 20.0;

		// perspective projection
		var projectionMatrix = perspectiveMatrix(
			fovRadians,
			aspectRatio,
			nearClip,
			farClip,
		);
	}

	// eye and target
	var eye = [0, 5, 5];
	var target = [0, 0, 0];

	var modelMatrix = identityMatrix();

	// TODO: set up transformations to the model
	// center to origin
	const T = translateMatrix(0, 0, 0);
  
	// uniform scale to fit into ~[-1,1] in X/Y
	var s = 1;
	var h = 1;
	if(heightmapData)
	{
		s = 2 / Math.max(heightmapData.width, heightmapData.height) - 1;
		h = height.value / 100;
	}
	const S = scaleMatrix(scale.value * s, scale.value * h, scale.value * s);

	if (!isDragging)
	{
		rotationx = rotation_slider_x.value;
		rotationy = rotation_slider_y.value;
	}

	// rotate map around y axis
	const Ry = rotateYMatrix(rotationy * Math.PI/180);

	// tilt so you can see height variation
	const Rx = rotateXMatrix(rotationx * Math.PI/180);
  
	// M = Rx * S * T
	modelMatrix = multiplyMatrices(Ry, multiplyMatrices(S, T));
	modelMatrix = multiplyMatrices(Rx, modelMatrix);

	// Orienting model so that 0,0,0 index of an image is at the top left
	// we need to flip it at the end of all our custom rotations
	const Rf = rotateYMatrix(180 * Math.PI/180);
	modelMatrix = multiplyMatrices(Rf, modelMatrix);

	if (projection.value == "orthographic")
	{
		// Flipping model because orthographic projection assumes the camera is looking up the positive z-axis
		// so if we want it to match the perspective projection, we need to flip it at the end of all our custom rotations
		const Rf = rotateXMatrix(180 * Math.PI/180);
		modelMatrix = multiplyMatrices(Rf, modelMatrix);

	}

	// panning
	const Tx = translateMatrix(translate[0], translate[1], translate[2]);
	modelMatrix = multiplyMatrices(Tx, modelMatrix);

	// setup viewing matrix
	var eyeToTarget = subtract(target, eye);
	var viewMatrix = setupViewMatrix(eye, target);

	// model-view Matrix = view * model
	var modelviewMatrix = multiplyMatrices(viewMatrix, modelMatrix);


	// enable depth testing
	gl.enable(gl.DEPTH_TEST);

	// disable face culling to render both sides of the triangles
	gl.disable(gl.CULL_FACE);

	gl.clearColor(0.2, 0.2, 0.2, 1);

	// clear depth buffer too, or else the previous image file's depth buffer will be used
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	gl.useProgram(program);
	
	// update modelview and projection matrices to GPU as uniforms
	gl.uniformMatrix4fv(uniformModelViewLoc, false, new Float32Array(modelviewMatrix));
	gl.uniformMatrix4fv(uniformProjectionLoc, false, new Float32Array(projectionMatrix));

	gl.bindVertexArray(vao);
	
	if(wireframe.checked)
	{
		gl.drawArrays(gl.LINES, 0, vertexCount);
	}
	else
	{
		gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
	}

	then = now;                            // remember time for next frame
  	const fps = 1 / deltaTime;             // compute frames per second
  	fpsElem.textContent = fps.toFixed(1);  // update fps display

	requestAnimationFrame(draw);

}

function createBox()
{
	function transformTriangle(triangle, matrix) {
		var v1 = [triangle[0], triangle[1], triangle[2], 1];
		var v2 = [triangle[3], triangle[4], triangle[5], 1];
		var v3 = [triangle[6], triangle[7], triangle[8], 1];

		var newV1 = multiplyMatrixVector(matrix, v1);
		var newV2 = multiplyMatrixVector(matrix, v2);
		var newV3 = multiplyMatrixVector(matrix, v3);

		return [
			newV1[0], newV1[1], newV1[2],
			newV2[0], newV2[1], newV2[2],
			newV3[0], newV3[1], newV3[2]
		];
	}

	var box = [];

	var triangle1 = [
		-1, -1, +1,
		-1, +1, +1,
		+1, -1, +1,
	];
	box.push(...triangle1)

	var triangle2 = [
		+1, -1, +1,
		-1, +1, +1,
		+1, +1, +1
	];
	box.push(...triangle2);

	// 3 rotations of the above face
	for (var i=1; i<=3; i++) 
	{
		var yAngle = i* (90 * Math.PI / 180);
		var yRotMat = rotateYMatrix(yAngle);

		var newT1 = transformTriangle(triangle1, yRotMat);
		var newT2 = transformTriangle(triangle2, yRotMat);

		box.push(...newT1);
		box.push(...newT2);
	}

	// a rotation to provide the base of the box
	var xRotMat = rotateXMatrix(-90 * Math.PI / 180);
	box.push(...transformTriangle(triangle1, xRotMat));
	box.push(...transformTriangle(triangle2, xRotMat));

	// seems like a face was forgotten so I added it
	var xRotMat = rotateXMatrix(90 * Math.PI / 180);
	box.push(...transformTriangle(triangle1, xRotMat));
	box.push(...transformTriangle(triangle2, xRotMat));


	return {
		positions: box
	};

}

var isDragging = false;
var startX, startY;
var leftMouse = false;
var controlPressed = false;

function addMouseCallback(canvas)
{
	isDragging = false;

	canvas.addEventListener("mousedown", function (e) 
	{
		if (e.button === 0) {
			// console.log("Left button pressed");
			leftMouse = true;
		} else if (e.button === 2) {
			// console.log("Right button pressed");
			leftMouse = false;
		}

		isDragging = true;
		startX = e.offsetX;
		startY = e.offsetY;
	});

	document.addEventListener("keydown", function (e) 
	{
		if (e.code === "ControlLeft" && !e.repeat) {
			// console.log("Control key pressed");
			controlPressed = true;
		}
	});

	document.addEventListener("keyup", function (e) 
	{
		if (e.code === "ControlLeft") {
			// console.log("Control key released");
			controlPressed = false;
		}
	});

	canvas.addEventListener("contextmenu", function(e)  {
		e.preventDefault(); // disables the default right-click menu
	});


	canvas.addEventListener("wheel", function(e)  {
		e.preventDefault(); // prevents page scroll

		if (e.deltaY < 0) 
		{
			// console.log("Scrolled up");
			// console.log(scale.value);
			scale.stepUp();
		} else {
			// console.log("Scrolled down");
			// console.log(scale.value);
			scale.stepDown();
		}
	});

	document.addEventListener("mousemove", function (e) {
		if (!isDragging) return;
		var currentX = e.offsetX;
		var currentY = e.offsetY;

		var deltaX = currentX - startX;
		var deltaY = currentY - startY;
		// console.log('mouse drag by: ' + deltaX + ', ' + deltaY);

		// Is dragging on x or y axis?
		var axis = null;
		if (Math.abs(deltaX) > Math.abs(deltaY))
		{
			axis = "x";
		}
		else
		{
			axis = "y";
		}

		if(leftMouse)
		{
			// update start position so that the rotation angle doesnt keep increasing as we keep dragging
			startX = currentX;
			startY = currentY;

			// rotation speed (rotates too fast otherwise)
			var rotation_speed = 0.5;

			if(axis === "x")
			{
				rotationy = Number(rotationy) - (deltaX * rotation_speed) ;
				rotation_slider_y.value = String(((rotationy % 360) + 360) % 360);
				// console.log(rotation_slider_y.value);
			}
			else
			{
				rotationx = Number(rotationx) + (deltaY * rotation_speed) ;
				rotation_slider_x.value = String(((rotationx % 360) + 360) % 360);
				// console.log(rotation_slider_x.value);
			}
		}
		else
		{
			// update start position so that the panning increments evenly
			startX = currentX;
			startY = currentY;

			// panning speed (panning too fast otherwise)
			var panning_speed = 0.01;

			if(controlPressed)
			{
				// panning on y axis
				translate[1] -= deltaY * panning_speed;
			}
			else
			{
				// panning on x and z axis
				translate[0] += deltaX * panning_speed;
				// panning on z axis for perspective projection cuz you can't see panning on Z axis in ortho anyway
				if (projection.value == "perspective")
				{
					translate[2] += deltaY * panning_speed;
				}
			}

			// console.log("X: " + translate[0] + ", Y: " + translate[1] + ", Z: " + translate[2]);
		}
	});

	document.addEventListener("mouseup", function () {
		isDragging = false;
	});

	document.addEventListener("mouseleave", () => {
		isDragging = false;
	});
}

function initialize() 
{
	var canvas = document.querySelector("#glcanvas");
	canvas.width = canvas.clientWidth;
	canvas.height = canvas.clientHeight;

	gl = canvas.getContext("webgl2");

	// add mouse callbacks
	addMouseCallback(canvas);

	var box = createBox();
	vertexCount = box.positions.length / 3;		// vertexCount is global variable used by draw()
	// console.log(box);

	// create buffers to put in box
	var boxVertices = new Float32Array(box['positions']);
	var posBuffer = createBuffer(gl, gl.ARRAY_BUFFER, boxVertices);

	var vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSrc);
	var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc);
	program = createProgram(gl, vertexShader, fragmentShader);

	// attributes (per vertex)
	var posAttribLoc = gl.getAttribLocation(program, "position");

	// uniforms
	uniformModelViewLoc = gl.getUniformLocation(program, 'modelview');
	uniformProjectionLoc = gl.getUniformLocation(program, 'projection');

	vao = createVAO(gl, 
		// positions
		posAttribLoc, posBuffer, 

		// normals (unused in this assignments)
		null, null, 

		// colors (not needed--computed by shader)
		null, null
	);

	window.requestAnimationFrame(draw);
}

window.onload = initialize();