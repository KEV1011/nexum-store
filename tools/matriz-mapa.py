# Compone los DOS filtros de color en UNO. Aplicar dos ColorFiltered anidados
# obliga a Flutter a hacer dos saveLayer a pantalla completa en cada frame.
inv = [-1,0,0,0,255,  0,-1,0,0,255,  0,0,-1,0,255,  0,0,0,1,0]
tono= [-0.574,1.430,0.144,0,0,  0.426,0.430,0.144,0,0,  0.426,1.430,-0.856,0,0,  0,0,0,1,0]

def parte(m):
    A=[[m[f*5+c] for c in range(4)] for f in range(4)]
    b=[m[f*5+4] for f in range(4)]
    return A,b

A1,b1=parte(inv); A2,b2=parte(tono)
# z = A2(A1 x + b1) + b2  =>  A = A2*A1 ,  b = A2*b1 + b2
A=[[sum(A2[i][k]*A1[k][j] for k in range(4)) for j in range(4)] for i in range(4)]
b=[sum(A2[i][k]*b1[k] for k in range(4))+b2[i] for i in range(4)]

comb=[]
for i in range(4):
    comb += [round(A[i][j],6) for j in range(4)] + [round(b[i],6)]

def aplica(m,c):
    A,b=parte(m)
    return [max(0,min(255, sum(A[i][j]*c[j] for j in range(4))+b[i])) for i in range(4)]

# Verificación: los dos caminos tienen que dar lo MISMO en colores reales de mapa.
casos={'blanco':[255,255,255,255],'agua OSM':[170,211,223,255],'parque':[200,224,180,255],
       'via':[248,244,240,255],'texto':[60,60,60,255],'negro':[0,0,0,255]}
print('color      | dos filtros        | uno solo           | igual')
ok=True
for n,c in casos.items():
    dos=aplica(tono,aplica(inv,c)); uno=aplica(comb,c)
    igual=all(abs(x-y)<0.001 for x,y in zip(dos,uno)); ok&=igual
    print(f'{n:10} | {[round(v) for v in dos]!s:18} | {[round(v) for v in uno]!s:18} | {igual}')
print('\nTODOS IGUALES:', ok)
print('\nmatriz combinada:'); 
for i in range(4): print('  ' + ', '.join(f'{comb[i*5+j]}' for j in range(5)) + ',')
